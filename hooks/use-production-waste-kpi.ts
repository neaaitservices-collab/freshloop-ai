'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { VolumetricScrapLoggedEvent } from '@/components/features/operations/VolumetricScrapForm';
import { fetchOperationsDashboardSnapshot } from '@/components/features/operations/operationsLedgerClient';
import type { WasteKpiReport } from '@/lib/domains/inventory/ledger';
import { notifyInventoryUpdated } from '@/lib/domains/inventory/inventoryMoveClient';
import {
  FRESHLOOP_SETTINGS_UPDATED,
  readSettingsUpdatedEvent,
} from '@/lib/domains/stats/settingsEvents';
import type { PlatformSettings } from '@/lib/domains/stats/platformSettings';

export function useProductionWasteKpi(activeUserId: string | undefined) {
  const [wasteKpiReport, setWasteKpiReport] = useState<WasteKpiReport | null>(null);
  const [platformScrapConfig, setPlatformScrapConfig] = useState({
    scrapBucketVolumeL: 20,
    estimatedWeightPerLiterKg: 0.65,
    blendedCostPerKg: 3.5,
  });
  const [syncing, setSyncing] = useState(false);

  const scrapStoreConfig = useMemo(() => {
    const inputs = wasteKpiReport?.scrapBucketInputs;
    if (inputs) {
      return {
        scrapBucketVolumeL: inputs.volumeL,
        estimatedWeightPerLiterKg: inputs.densityKgPerL,
        blendedCostPerKg: inputs.costPerKg,
      };
    }
    return platformScrapConfig;
  }, [wasteKpiReport?.scrapBucketInputs, platformScrapConfig]);

  const refreshWasteKpi = useCallback(async (showSpinner = false) => {
    if (showSpinner) setSyncing(true);
    try {
      const snapshot = await fetchOperationsDashboardSnapshot();
      if (snapshot.wasteKpi) setWasteKpiReport(snapshot.wasteKpi);
    } catch {
      /* keep last KPI */
    } finally {
      if (showSpinner) setSyncing(false);
    }
  }, []);

  const syncStoreSettings = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/settings', { cache: 'no-store' });
      const json = (await response.json()) as {
        success?: boolean;
        settings?: PlatformSettings;
      };
      if (!response.ok || !json.success || !json.settings) return;
      setPlatformScrapConfig({
        scrapBucketVolumeL: json.settings.scrapBucketVolumeL,
        estimatedWeightPerLiterKg: json.settings.estimatedWeightPerLiterKg,
        blendedCostPerKg: json.settings.defaultScrapCostPerKg,
      });
    } catch {
      /* defaults */
    }
  }, []);

  useEffect(() => {
    void refreshWasteKpi(true);
    void syncStoreSettings();
  }, [refreshWasteKpi, syncStoreSettings]);

  useEffect(() => {
    const onInventory = () => void refreshWasteKpi(false);
    const onSettings = (event: Event) => {
      const saved = readSettingsUpdatedEvent(event);
      if (saved) {
        setWasteKpiReport((prev) =>
          prev ? { ...prev, targetWastePct: saved.targetWastePct } : prev
        );
      }
      void refreshWasteKpi(false);
      void syncStoreSettings();
    };
    window.addEventListener('freshloop-inventory-updated', onInventory);
    window.addEventListener(FRESHLOOP_SETTINGS_UPDATED, onSettings);
    return () => {
      window.removeEventListener('freshloop-inventory-updated', onInventory);
      window.removeEventListener(FRESHLOOP_SETTINGS_UPDATED, onSettings);
    };
  }, [refreshWasteKpi, syncStoreSettings]);

  const logVolumetricScrap = useCallback(
    async (bucketsDelta: number, event: VolumetricScrapLoggedEvent) => {
      const res = await fetch('/api/inventory/volumetric-scrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buckets: bucketsDelta,
          staffId: activeUserId ?? 'staff-kitchen',
        }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? 'Could not log volumetric scrap.');
      }
      notifyInventoryUpdated();
      await refreshWasteKpi(false);
    },
    [activeUserId, refreshWasteKpi]
  );

  return {
    wasteKpi: wasteKpiReport,
    scrapStoreConfig,
    syncing,
    refreshWasteKpi,
    logVolumetricScrap,
  };
}

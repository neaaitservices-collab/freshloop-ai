'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { VolumetricScrapLoggedEvent } from '@/components/features/operations/VolumetricScrapForm';
import type { WasteKpiReport } from '@/lib/domains/inventory/ledger';
import { subscribeInventoryUpdated } from '@/lib/domains/inventory/inventoryMoveClient';
import { notifyKpiUpdated } from '@/lib/domains/stats/kpiEvents';
import {
  FRESHLOOP_SETTINGS_UPDATED,
  readSettingsUpdatedEvent,
} from '@/lib/domains/stats/settingsEvents';
import type { PlatformSettings } from '@/lib/domains/stats/platformSettings';

export interface UseProductionWasteKpiOptions {
  /** When true, caller hydrates via `applyBootstrap` (`/api/production/bootstrap`). */
  deferInitialFetch?: boolean;
}

export function useProductionWasteKpi(options?: UseProductionWasteKpiOptions) {
  const deferInitialFetch = options?.deferInitialFetch ?? false;
  const [wasteKpiReport, setWasteKpiReport] = useState<WasteKpiReport | null>(null);
  const [platformScrapConfig, setPlatformScrapConfig] = useState({
    scrapBucketVolumeL: 20,
    estimatedWeightPerLiterKg: 0.65,
    blendedCostPerKg: 3.5,
  });
  const [syncing, setSyncing] = useState(false);

  const applyBootstrap = useCallback(
    (payload: { wasteKpi: WasteKpiReport; storeSettings: PlatformSettings }) => {
      setWasteKpiReport(payload.wasteKpi);
      setPlatformScrapConfig({
        scrapBucketVolumeL: payload.storeSettings.scrapBucketVolumeL,
        estimatedWeightPerLiterKg: payload.storeSettings.estimatedWeightPerLiterKg,
        blendedCostPerKg: payload.storeSettings.defaultScrapCostPerKg,
      });
    },
    []
  );

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
      const res = await fetch('/api/inventory/waste-kpi', { cache: 'no-store' });
      const json = (await res.json()) as {
        success?: boolean;
        wasteKpi?: WasteKpiReport;
      };
      if (res.ok && json.success && json.wasteKpi) {
        setWasteKpiReport(json.wasteKpi);
      }
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
    if (deferInitialFetch) return;
    void refreshWasteKpi(true);
    void syncStoreSettings();
  }, [deferInitialFetch, refreshWasteKpi, syncStoreSettings]);

  useEffect(() => {
    const onInventory = (detail?: { skipWasteKpiRefresh?: boolean }) => {
      if (detail?.skipWasteKpiRefresh) return;
      void refreshWasteKpi(false);
    };
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
    const unsubInventory = subscribeInventoryUpdated(onInventory);
    window.addEventListener(FRESHLOOP_SETTINGS_UPDATED, onSettings);
    return () => {
      unsubInventory();
      window.removeEventListener(FRESHLOOP_SETTINGS_UPDATED, onSettings);
    };
  }, [refreshWasteKpi, syncStoreSettings]);

  const logVolumetricScrap = useCallback(
    async (bucketsDelta: number, _event?: VolumetricScrapLoggedEvent) => {
      void _event;
      const res = await fetch('/api/inventory/volumetric-scrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buckets: bucketsDelta }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        wasteKpi?: WasteKpiReport;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? 'Could not log volumetric scrap.');
      }
      if (json.wasteKpi) {
        setWasteKpiReport(json.wasteKpi);
        notifyKpiUpdated();
        return;
      }
      notifyKpiUpdated();
      await refreshWasteKpi(false);
    },
    [refreshWasteKpi]
  );

  return {
    wasteKpi: wasteKpiReport,
    scrapStoreConfig,
    syncing,
    refreshWasteKpi,
    logVolumetricScrap,
    applyBootstrap,
  };
}

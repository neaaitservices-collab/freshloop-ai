'use client';

import React, { useCallback, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { stashInvoiceForReceiving } from '@/lib/domains/receiving/receivingBridge';
import type { InvoiceOcrResult } from '@/lib/types';
import { useRegisterAppVoice } from '@/components/layout/AppVoiceOverrideContext';
import {
  notifyInventoryUpdated,
} from '@/lib/domains/inventory/inventoryMoveClient';
import { PageMain } from '@/components/ui/layout';
import { InvoiceUploadModal } from '@/components/features/invoices/InvoiceUploadModal';
import { VoiceLoggerModal } from '@/components/features/voice/VoiceLoggerModal';
import {
  FRESHLOOP_SETTINGS_UPDATED,
  readSettingsUpdatedEvent,
} from '@/lib/domains/stats/settingsEvents';
import type { PlatformSettings } from '@/lib/domains/stats/platformSettings';
import { OperationsLiveTransfers } from '@/components/features/operations/OperationsLiveTransfers';
import {
  Activity,
  DollarSign,
  FileText,
  Mic,
  RefreshCw,
} from 'lucide-react';
import { useRole } from '@/components/auth/RoleProvider';
import { canManageBundleDeals } from '@/lib/auth/staffCapabilities';
import { SetBundlesListPanel } from '@/components/features/pricing/SetBundlesListPanel';

export default function OperationsCenter() {
  const router = useRouter();
  const { activeUser } = useRole();
  const showSetBundles = canManageBundleDeals(activeUser?.role);
  const [pullSensitivityDays, setPullSensitivityDays] = useState<2 | 3 | 4>(3);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const openVoiceModal = useCallback(() => setIsVoiceModalOpen(true), []);
  useRegisterAppVoice(openVoiceModal);

  const syncStoreSettings = useCallback(async (showSpinner = false) => {
    if (showSpinner) setSettingsLoading(true);
    try {
      const response = await fetch('/api/admin/settings', { cache: 'no-store' });
      const json = (await response.json()) as { success?: boolean; settings?: PlatformSettings };
      if (!response.ok || !json.success || !json.settings) return;
      const days = json.settings.pullSensitivityDays;
      if (days === 2 || days === 3 || days === 4) {
        setPullSensitivityDays(days);
      }
    } catch {
      /* keep current */
    } finally {
      if (showSpinner) setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    void syncStoreSettings(true);
  }, [syncStoreSettings]);

  useEffect(() => {
    const onSettings = (event: Event) => {
      readSettingsUpdatedEvent(event);
      void syncStoreSettings(false);
    };
    window.addEventListener(FRESHLOOP_SETTINGS_UPDATED, onSettings);
    return () => window.removeEventListener(FRESHLOOP_SETTINGS_UPDATED, onSettings);
  }, [syncStoreSettings]);

  return (
    <div className="flex w-full min-w-0 flex-1 flex-col overflow-x-clip bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-slate-950">
      <PageMain className="space-y-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-slate-950 border border-slate-800/90 p-5 sm:p-7 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold uppercase tracking-wider">
                <Activity className="w-3.5 h-3.5 animate-pulse" />
                <span>Manager command center • Immutable ledger</span>
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white">
                FreshLoop AI{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400">
                  Floor &amp; rescue transfers
                </span>
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
                Live pulls between <code className="text-emerald-300 font-mono">Retail_Floor</code>{' '}
                and <code className="text-amber-300 font-mono">Production_Prep</code>. BOM batches,
                volumetric scrap, and deli labels live on{' '}
                <Link href="/production" className="font-semibold text-emerald-400 hover:text-emerald-300">
                  Production
                </Link>
                .
              </p>
            </div>

            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-2.5">
              <Link
                href="/receive"
                className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-3 py-2.5 text-slate-950 text-xs font-extrabold shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-300 active:scale-95 sm:px-4"
              >
                <DollarSign className="w-4 h-4" />
                <span>Receiving prices</span>
              </Link>

              <button
                type="button"
                onClick={() => setIsVoiceModalOpen(true)}
                className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-400 px-3 py-2.5 text-xs font-extrabold text-slate-950 shadow-lg shadow-teal-500/20 transition-all hover:from-teal-400 hover:to-emerald-300 active:scale-95 sm:px-4"
              >
                <Mic className="w-4 h-4 fill-slate-950" />
                <span>Voice Logger</span>
              </button>

              <button
                type="button"
                onClick={() => setIsInvoiceModalOpen(true)}
                className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-700/80 bg-slate-900 px-3 py-2.5 text-xs font-bold text-slate-100 shadow-inner transition-all hover:bg-slate-800 active:scale-95 sm:px-4"
              >
                <FileText className="w-4 h-4 text-emerald-400" />
                <span>Invoice OCR</span>
              </button>

              <button
                type="button"
                onClick={() => void syncStoreSettings(true)}
                disabled={settingsLoading}
                className="col-span-2 flex min-h-11 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 text-slate-400 transition-all hover:bg-slate-800 hover:text-white sm:col-span-1 sm:min-w-11 sm:px-2.5"
                title="Sync store settings"
              >
                <RefreshCw
                  className={`w-4 h-4 ${settingsLoading ? 'animate-spin text-emerald-400' : ''}`}
                />
              </button>
            </div>
          </div>
        </div>

        <div className="min-w-0 max-w-full">
          <OperationsLiveTransfers pullDays={pullSensitivityDays} />
        </div>
      </PageMain>

      <InvoiceUploadModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        onInvoiceImported={(result: InvoiceOcrResult) => {
          stashInvoiceForReceiving(result);
          setIsInvoiceModalOpen(false);
          router.push('/receive');
        }}
      />

      <VoiceLoggerModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        onVoiceConfirmed={() => {
          notifyInventoryUpdated();
        }}
      />
    </div>
  );
}

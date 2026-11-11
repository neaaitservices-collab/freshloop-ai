import type { ReceivingLog } from '@/lib/domains/receiving/yieldPricing';

export const OPEN_SCAN_CHOICE_KEY = 'freshloop-open-invoice-scan-v1';

export interface OpenScanChoice {
  draftId: string;
  supplierId: string;
  manualReviewOverride: boolean;
}

type ScanStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStorage(): ScanStorage | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage;
}

export function applyOpenScanChoice(
  logs: ReceivingLog[],
  choice: OpenScanChoice | null
): ReceivingLog[] {
  if (!choice?.manualReviewOverride) return logs;
  const draftId = choice.draftId.trim();
  if (!draftId || !logs.some((log) => log.draftId === draftId)) return logs;
  return logs.map((log) => (log.draftId === draftId ? { ...log, manualReviewOverride: true } : log));
}

export function rememberOpenScanChoice(
  choice: OpenScanChoice,
  storage: ScanStorage | null = browserStorage()
): void {
  const draftId = choice.draftId.trim();
  if (!draftId || !storage) return;
  storage.setItem(
    OPEN_SCAN_CHOICE_KEY,
    JSON.stringify({
      draftId,
      supplierId: choice.supplierId.trim(),
      manualReviewOverride: choice.manualReviewOverride === true,
    })
  );
}

export function readOpenScanChoice(storage: ScanStorage | null = browserStorage()): OpenScanChoice | null {
  if (!storage) return null;
  const raw = storage.getItem(OPEN_SCAN_CHOICE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OpenScanChoice>;
    const draftId = parsed.draftId?.trim() ?? '';
    if (!draftId) return null;
    return {
      draftId,
      supplierId: parsed.supplierId?.trim() ?? '',
      manualReviewOverride: parsed.manualReviewOverride === true,
    };
  } catch {
    return null;
  }
}

export function clearOpenScanChoice(storage: ScanStorage | null = browserStorage()): void {
  storage?.removeItem(OPEN_SCAN_CHOICE_KEY);
}

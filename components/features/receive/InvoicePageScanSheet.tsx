'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { Camera, Check, GripVertical, ImagePlus, Loader2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRole } from '@/components/auth/RoleProvider';
import { InvoiceDateField } from '@/components/features/receive/InvoiceDateField';
import { SupplierSelect } from '@/components/features/suppliers/SupplierSelect';
import { Button } from '@/components/ui/Button';
import type { RestoredInvoiceScan } from '@/lib/domains/receiving/openInvoiceScan';
import { INVOICE_DATE_WARNING } from '@/lib/domains/receiving/invoiceDatePicker';
import { formatInvoiceDeliveryDay } from '@/lib/domains/receiving/invoiceDatePicker';
import {
  confirmInvoiceDateResolution,
  continuablePendingIndexes,
  duplicateRemovalNote,
  INVOICE_PAGE_BATCH_SIZE,
  INVOICE_PAGE_MAX,
  InvoiceScanRequestError,
  invoiceReviewHardBlocked,
  nextRemainingIndexes,
  PAGE_CAP_MESSAGE,
  readPostedInvoiceDate,
  retryAfterPlan,
  scanStepAfterClientFailure,
  type InvoicePageStatus,
} from '@/lib/domains/receiving/invoicePageScan';
import { selectInvoiceHeaderTotal } from '@/lib/domains/receiving/invoiceHeaderTotal';
import {
  addOcrSupplierLabel,
  matchSupplierByName,
  printedSupplierName,
} from '@/lib/domains/suppliers/supplierInvoiceMatch';
import {
  clerkCannotConfirm,
  clerkManagerReviewCopy,
  CLERK_MANAGER_REASON,
  invoiceRequestErrorMessage,
  lineBlockerNeedsManager,
  managerApprovalLabel,
  needsManagerSignoff,
  showManagerOverride,
} from '@/lib/domains/receiving/receiveReviewGate';
import type { SupplierRecord } from '@/lib/domains/suppliers/suppliers';
import type { InvoiceLineItemExtract } from '@/lib/types';
import {
  invoiceMatchResolutions,
  type InvoiceMatchChoice,
} from '@/lib/domains/receiving/invoiceMatchChoice';
import { ReceiveLineProductMatch } from '@/components/features/receive/ReceiveLineProductMatch';
import {
  isInvoiceLevelBlocker,
  lineNeedsCheck,
  receiveLinePill,
  reviewCounts,
  type ReceiveLineFacts,
} from '@/lib/domains/receiving/invoiceLineReview';
import {
  limitInvoiceOcrUpload,
  prepareImageFileForOcr,
  type OcrPageImage,
} from '@/lib/utils/prepareImageForOcr';
import { isManager } from '@/lib/utils/roles';

type Step = 'choose' | 'pages' | 'scanning' | 'review';

interface LocalPage {
  id: string;
  previewUrl: string;
  dataUrl: string;
  mimeType: string;
}

interface PageChip {
  index: number;
  status: InvoicePageStatus;
  error?: string;
}

interface ReviewLine {
  name: string;
  page?: number;
  quantity?: number;
  unit: string;
  unitCost?: number;
  totalCost?: number;
  productId?: string | null;
  productName?: string | null;
  supplierCode?: string | null;
  matchSource?: 'code' | 'learned_name' | 'name' | null;
  matchPrintedValue?: string | null;
  quantityUnreadable?: boolean;
  costUnreadable?: boolean;
  nameUnreadable?: boolean;
  unitInvalid?: boolean;
  lineTotalMismatch?: boolean;
  departmentAssumed?: boolean;
  requiresApproval?: boolean;
  fuzzyAmbiguous?: boolean;
  createNew?: boolean;
}

interface ScanView {
  draftId: string;
  status: 'scanning' | 'ready' | 'failed';
  pageCount: number;
  pages: PageChip[];
  dedupedCount: number;
  dedupedFrom: number[];
  duplicateNote: string;
  totalsFromPage: number | null;
  printedSubtotal?: number;
  printedHst?: number;
  printedPst?: number;
  blockers: string[];
  reviewFlags: string[];
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceDateNeedsConfirm: boolean;
  invoiceDateConfirmReason?: string;
  lines: ReviewLine[];
}

export function InvoicePageScanSheet({
  open,
  onClose,
  suppliers,
  resume,
  onDiscarded,
  onReceived,
  onSupplierCreated,
}: {
  open: boolean;
  onClose: () => void;
  suppliers: SupplierRecord[];
  resume?: RestoredInvoiceScan | null;
  onDiscarded?: (draftId: string) => void;
  onReceived?: (vendorName: string) => void;
  onSupplierCreated?: (supplier: SupplierRecord) => void;
}) {
  const router = useRouter();
  const titleId = useId();
  const { activeUser } = useRole();
  const manager = Boolean(activeUser && isManager(activeUser.role));
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const retakeRef = useRef<HTMLInputElement>(null);
  const retakeLibraryRef = useRef<HTMLInputElement>(null);
  const retakeIndex = useRef<number | null>(null);
  const dragIndex = useRef<number | null>(null);
  const clientScanId = useRef('');
  const resumedId = useRef<string | null>(null);
  const localImages = useRef<Map<number, OcrPageImage>>(new Map());
  const viewRef = useRef<ScanView | null>(null);

  const [step, setStep] = useState<Step>('choose');
  const [pages, setPages] = useState<LocalPage[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ScanView | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [dateDraft, setDateDraft] = useState('');
  const [dateConfirmed, setDateConfirmed] = useState(false);
  const [showAllLines, setShowAllLines] = useState(false);
  const [managerApproved, setManagerApproved] = useState(false);
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [working, setWorking] = useState(false);
  const [lineEdits, setLineEdits] = useState<Record<number, InvoiceMatchChoice>>({});
  const [sheet, setSheet] = useState<{ index: number; fromCheck: boolean } | null>(null);
  const lineRefs = useRef<Map<number, HTMLLIElement>>(new Map());
  const [continueAt, setContinueAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const rememberView = (next: ScanView | null) => {
    viewRef.current = next;
    setView(next);
  };

  const resetLocal = () => {
    setStep('choose');
    setPages([]);
    setError(null);
    rememberView(null);
    setSupplierId('');
    setDateDraft('');
    setDateConfirmed(false);
    setShowAllLines(false);
    setManagerApproved(false);
    setCreatingSupplier(false);
    setLineEdits({});
    setSheet(null);
    setContinueAt(null);
    localImages.current = new Map();
    clientScanId.current = '';
  };

  useEffect(() => {
    if (!open) return;
    const id = resume?.draftId?.trim() ?? '';
    if (!resume?.pageScan || !id || resumedId.current === id) return;
    resumedId.current = id;
    clientScanId.current = resume.pageScan.clientScanId ?? '';
    const next = viewFromRestored(resume);
    rememberView(next);
    setDateDraft(next.invoiceDate);
    setDateConfirmed(false);
    setStep(next.status === 'ready' ? 'review' : 'scanning');
    setError(null);
  }, [open, resume]);

  useEffect(() => {
    if (!sheet) return;
    lineRefs.current.get(sheet.index)?.scrollIntoView({ block: 'center' });
  }, [sheet, showAllLines]);

  useEffect(() => {
    if (!open || step !== 'review' || !view || supplierId) return;
    const match = matchSupplierByName(view.vendorName, suppliers);
    if (match.status === 'matched') setSupplierId(match.supplier.id);
  }, [open, step, view, supplierId, suppliers]);

  useEffect(() => {
    if (!open || step !== 'scanning' || !view?.draftId) return;
    let stopped = false;
    const tick = async () => {
      try {
        const response = await fetch('/api/receiving-invoices/open-draft', { cache: 'no-store' });
        const json = (await response.json()) as { success?: boolean; draft?: RestoredInvoiceScan | null };
        if (stopped || !response.ok || !json.draft?.pageScan) return;
        if (json.draft.draftId !== view.draftId) return;
        const next = viewFromRestored(json.draft);
        viewRef.current = next;
        setView(next);
        if (next.status === 'ready') {
          setDateDraft((current) => current || next.invoiceDate);
          setStep('review');
        }
      } catch {
        // The next poll retries. The scan stays on the server.
      }
    };
    const timer = setInterval(() => void tick(), 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [open, step, view?.draftId]);

  useEffect(() => {
    if (continueAt == null) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [continueAt]);

  const appendPrepared = (incoming: OcrPageImage[], previews: string[]) => {
    setPages((current) => {
      const room = INVOICE_PAGE_MAX - current.length;
      if (room <= 0) return current;
      return [
        ...current,
        ...incoming.slice(0, room).map((page, index) => ({
          id: `${Date.now()}-${current.length + index}-${page.mimeType}`,
          previewUrl: previews[index] || page.dataUrl,
          dataUrl: page.dataUrl,
          mimeType: page.mimeType,
        })),
      ];
    });
    setStep('pages');
  };

  const ingestFiles = async (list: FileList | File[]) => {
      const files = [...list];
      if (files.length === 0) return;
      setPreparing(true);
      setError(null);
      try {
        const gathered: OcrPageImage[] = [];
        const previews: string[] = [];
        for (const file of files) {
          const prepared = await prepareImageFileForOcr(file);
          for (const page of prepared.pages) {
            gathered.push(page);
            previews.push(page.dataUrl);
          }
        }
        if (pages.length + gathered.length > INVOICE_PAGE_MAX) setError(PAGE_CAP_MESSAGE);
        appendPrepared(gathered, previews);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not prepare the photo. Try another image.';
        setError(/too many pages/i.test(message) ? PAGE_CAP_MESSAGE : message);
      } finally {
        setPreparing(false);
      }
  };

  const applyPost = (json: Record<string, unknown>) => {
    const next = viewFromPost(json);
    if (!next) return;
    rememberView(next);
    setLineEdits({});
    if (next.status === 'ready') {
      setDateDraft((current) => current || next.invoiceDate);
      setStep('review');
    } else {
      setStep('scanning');
    }
  };

  const noteScanFailure = (err: unknown) => {
    setContinueAt(err instanceof InvoiceScanRequestError ? err.continueAtMs : null);
    setError(err instanceof Error ? err.message : 'The scan did not reach the server. Check the connection and try again.');
    const current = viewRef.current;
    const continuable = continuablePendingIndexes(current?.pages ?? [], localImages.current.keys());
    setStep(scanStepAfterClientFailure({ hasDraft: Boolean(current?.draftId), continuableIndexes: continuable }));
  };

  const postJson = async (body: unknown) => {
    const send = async () => {
      const response = await fetch('/api/invoice-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      let json: Record<string, unknown> = {};
      try {
        json = (await response.json()) as Record<string, unknown>;
      } catch {
        json = {};
      }
      return { response, json };
    };
    let { response, json } = await send();
    if (response.status === 429) {
      const plan = retryAfterPlan(response.headers.get('Retry-After'));
      if (plan.waitNow && plan.waitMs != null) {
        setError(plan.message);
        await new Promise((resolve) => setTimeout(resolve, plan.waitMs ?? 0));
        ({ response, json } = await send());
      }
      if (response.status === 429) {
        const again = retryAfterPlan(response.headers.get('Retry-After'));
        throw new InvoiceScanRequestError(again.message, again.waitMs);
      }
    }
    if (!response.ok || json.success === false) {
      throw new Error(invoiceRequestErrorMessage(response.status, json));
    }
    setContinueAt(null);
    setError(null);
    return json;
  };

  const runWaves = async (pageCount: number, startIndexes: number[]) => {
    let remaining = startIndexes;
    let previous = '';
    for (let guard = 0; guard < INVOICE_PAGE_MAX && remaining.length > 0; guard += 1) {
      const signature = remaining.join(',');
      if (signature === previous) break;
      previous = signature;
      const wave = remaining.slice(0, INVOICE_PAGE_BATCH_SIZE);
      const json = await postJson({
        clientScanId: clientScanId.current,
        pageCount,
        pages: wave.map((index) => ({
          index,
          imageBase64: localImages.current.get(index)?.dataUrl ?? '',
          mimeType: localImages.current.get(index)?.mimeType || 'image/jpeg',
        })),
      });
      applyPost(json);
      const status = typeof json.status === 'string' ? json.status : 'scanning';
      const pending = Array.isArray(json.pendingIndexes)
        ? json.pendingIndexes.filter((index): index is number => typeof index === 'number')
        : [];
      const next = nextRemainingIndexes(status, pending, (index) => localImages.current.has(index));
      if (!next) break;
      remaining = next;
    }
  };

  const startScan = async () => {
    if (pages.length === 0 || preparing) return;
    setWorking(true);
    setError(null);
    setContinueAt(null);
    setStep('scanning');
    try {
      const packed = await limitInvoiceOcrUpload(pages.map((page) => ({ dataUrl: page.dataUrl, mimeType: page.mimeType })));
      const ready = packed.map((page, index) => ({
        ...pages[index],
        dataUrl: page.dataUrl,
        mimeType: page.mimeType,
        previewUrl: pages[index]?.previewUrl || page.dataUrl,
      }));
      setPages(ready);
      localImages.current = new Map(ready.map((page, index) => [index + 1, { dataUrl: page.dataUrl, mimeType: page.mimeType }]));
      if (!clientScanId.current) clientScanId.current = crypto.randomUUID();
      await runWaves(ready.length, ready.map((_, index) => index + 1));
    } catch (err) {
      noteScanFailure(err);
    } finally {
      setWorking(false);
    }
  };

  const continueScan = async () => {
    const current = viewRef.current;
    const pending = continuablePendingIndexes(current?.pages ?? [], localImages.current.keys());
    if (!current?.draftId || pending.length === 0 || !clientScanId.current) return;
    setWorking(true);
    setError(null);
    setContinueAt(null);
    setStep('scanning');
    try {
      await runWaves(current.pageCount, pending);
    } catch (err) {
      noteScanFailure(err);
    } finally {
      setWorking(false);
    }
  };

  const reread = async (index: number, image: OcrPageImage | undefined) => {
    if (!view?.draftId || !image) return;
    setWorking(true);
    setError(null);
    setStep('scanning');
    try {
      const [packed] = await limitInvoiceOcrUpload([image]);
      if (!packed) throw new Error('Could not prepare the photo. Try another image.');
      localImages.current.set(index, packed);
      const json = await postJson({
        retryPage: true,
        draftId: view.draftId,
        page: { index, imageBase64: packed.dataUrl, mimeType: packed.mimeType },
      });
      applyPost(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That page could not be read.');
      setStep('scanning');
    } finally {
      setWorking(false);
    }
  };

  const onReplaceFailedPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const index = retakeIndex.current;
    event.target.value = '';
    if (!file || index == null) return;
    setPreparing(true);
    void prepareImageFileForOcr(file)
      .then((prepared) => {
        const page = prepared.pages[0];
        if (!page) throw new Error(PAGE_CAP_MESSAGE);
        return reread(index, page);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not prepare the photo. Try another image.');
      })
      .finally(() => setPreparing(false));
  };

  const undo = async () => {
    if (!view?.draftId) return;
    setWorking(true);
    setError(null);
    try {
      const json = await postJson({ undoDedupe: true, draftId: view.draftId });
      applyPost(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The duplicates could not be restored.');
    } finally {
      setWorking(false);
    }
  };

  const discardScan = async () => {
    const draftId = view?.draftId ?? '';
    if (!draftId) {
      resetLocal();
      onClose();
      return;
    }
    setWorking(true);
    try {
      const response = await fetch('/api/receiving-invoices/open-draft', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId }),
      });
      if (!response.ok && response.status !== 404 && response.status !== 409) {
        setError('The scan could not be discarded. It may still be here after a refresh.');
        return;
      }
      onDiscarded?.(draftId);
      resetLocal();
      onClose();
    } catch {
      setError('The scan could not be discarded. It may still be here after a refresh.');
    } finally {
      setWorking(false);
    }
  };

  const confirm = async () => {
    if (!view?.draftId || !supplierId) return;
    setWorking(true);
    setError(null);
    try {
      const dateResolution = confirmInvoiceDateResolution({ dateConfirmed, dateDraft });
      const lineResolution = invoiceMatchResolutions(
        view.lines.map((line, index) => ({ id: String(index), draftLineIndex: index })),
        Object.fromEntries(Object.entries(lineEdits).map(([index, choice]) => [index, choice])),
        Boolean(supplierId)
      );
      const resolutions =
        dateResolution || lineResolution
          ? { ...dateResolution, ...(lineResolution ? { lines: lineResolution.lines } : {}) }
          : undefined;
      const json = await postJson({
        confirmCommit: true,
        draftId: view.draftId,
        supplierId,
        ...(resolutions ? { resolutions } : {}),
        ...(managerApproved && manager ? { manualReviewOverride: true } : {}),
      });
      if (json.committed !== true && json.success !== true) {
        throw new Error(typeof json.error === 'string' ? json.error : 'The invoice was not received.');
      }
      window.dispatchEvent(new Event('freshloop-inventory-updated'));
      onReceived?.(view.vendorName);
      router.refresh();
      resetLocal();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The invoice was not received.');
    } finally {
      setWorking(false);
    }
  };

  const addPrintedSupplier = async () => {
    if (!view || creatingSupplier) return;
    const name = printedSupplierName(view.vendorName);
    if (!name) return;
    setCreatingSupplier(true);
    setError(null);
    try {
      const res = await fetch('/api/receiving-suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: printedSupplierName(view.vendorName) }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        supplier?: SupplierRecord;
        error?: string;
      };
      if (!res.ok || !json.success || !json.supplier?.id) {
        setError(json.error || 'Could not add that supplier.');
        return;
      }
      setSupplierId(json.supplier.id);
      onSupplierCreated?.(json.supplier);
    } catch {
      setError('Could not add that supplier. Check the connection and try again.');
    } finally {
      setCreatingSupplier(false);
    }
  };

  const movePage = (from: number, to: number) => {
    setPages((current) => {
      if (to < 0 || to >= current.length || from === to) return current;
      const next = [...current];
      const [item] = next.splice(from, 1);
      if (!item) return current;
      next.splice(to, 0, item);
      return next;
    });
  };

  if (!open) return null;

  const chips = view?.pages ?? [];
  const readCount = chips.filter((chip) => chip.status === 'read').length;
  const continuable = continuablePendingIndexes(chips, localImages.current.keys());
  const continueWaitMs = continueAt == null ? 0 : Math.max(0, continueAt - nowMs);
  const hardBlock = invoiceReviewHardBlocked({
    blockers: view?.blockers ?? [],
    invoiceDateNeedsConfirm: view?.invoiceDateNeedsConfirm === true,
    dateConfirmed,
  });
  const signoff = view ? needsManagerSignoff(view) : false;
  const showOverride = view
    ? showManagerOverride({
        manager,
        reviewFlags: view.reviewFlags,
        lines: view.lines,
        blockers: view.blockers,
      })
    : false;
  const clerkBlocked = view
    ? clerkCannotConfirm({
        manager,
        reviewFlags: view.reviewFlags,
        lines: view.lines,
        blockers: view.blockers,
      })
    : false;
  const confirmBlocked = clerkBlocked || (showOverride && signoff && !managerApproved);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/80 md:items-center" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden border border-slate-800 bg-slate-950 text-slate-100 shadow-2xl ${
          step === 'choose' ? 'max-w-md rounded-t-3xl md:rounded-3xl' : 'h-full max-w-md md:h-auto md:max-h-[92vh] md:rounded-3xl'
        }`}
      >
        <header className="flex items-center gap-3 border-b border-slate-800 px-4 py-3">
          {step !== 'choose' ? (
            <button
              type="button"
              className="min-h-11 min-w-11 rounded-xl text-sm text-slate-300"
              onClick={() => {
                if (step === 'pages' && !view?.draftId) {
                  resetLocal();
                  return;
                }
                onClose();
              }}
            >
              Receive
            </button>
          ) : (
            <span className="w-11" />
          )}
          <h2 id={titleId} className="min-w-0 flex-1 truncate text-center text-base font-bold">
            {step === 'choose' ? 'Scan invoice' : step === 'pages' ? 'Invoice pages' : step === 'scanning' ? 'Scanning invoice' : 'Review invoice'}
          </h2>
          {step === 'review' && view ? (
            <span className="rounded-full bg-emerald-400/15 px-2 py-1 text-xs font-bold text-emerald-300">
              {view.pageCount} {view.pageCount === 1 ? 'page' : 'pages'}
            </span>
          ) : (
            <span className="w-11" />
          )}
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {error ? (
            <p className="rounded-xl border border-amber-800/60 bg-amber-950/40 px-3 py-2 text-sm text-amber-100">{error}</p>
          ) : null}

          {step === 'choose' ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-300">One invoice, up to 8 pages.</p>
              <button
                type="button"
                className="flex min-h-11 w-full items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-3 py-3 text-left"
                onClick={() => cameraRef.current?.click()}
                disabled={preparing}
              >
                <Camera className="h-5 w-5 text-emerald-300" />
                <span>
                  <span className="block text-sm font-bold">Take photo</span>
                  <span className="block text-xs text-slate-400">Shoot page 1, then add the next page</span>
                </span>
              </button>
              <button
                type="button"
                className="flex min-h-11 w-full items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-3 py-3 text-left"
                onClick={() => libraryRef.current?.click()}
                disabled={preparing}
              >
                <ImagePlus className="h-5 w-5 text-emerald-300" />
                <span>
                  <span className="block text-sm font-bold">Choose photos or PDF</span>
                  <span className="block text-xs text-slate-400">Select several pages at once</span>
                </span>
              </button>
              {preparing ? (
                <p className="flex items-center gap-2 text-sm text-emerald-200">
                  <Loader2 className="h-4 w-4 animate-spin" /> Preparing pages…
                </p>
              ) : null}
            </div>
          ) : null}

          {step === 'pages' ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-300">Put pages in paper order. Last page has the totals.</p>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="rounded-full border border-slate-700 px-2 py-1 font-bold text-slate-200">
                  Page {pages.length} of {INVOICE_PAGE_MAX} max
                </span>
                <span>Hold the grip to move</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {pages.map((page, index) => (
                  <div
                    key={page.id}
                    className="relative rounded-2xl border border-slate-800 bg-slate-900 p-2"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const from = dragIndex.current;
                      dragIndex.current = null;
                      if (from == null) return;
                      movePage(from, index);
                    }}
                  >
                    {/* Local page previews are data URLs from the phone, not remote images. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={page.previewUrl} alt={`Page ${index + 1}`} className="h-28 w-full rounded-xl object-cover" />
                    <span className="absolute left-3 top-3 rounded-full bg-slate-950/80 px-2 py-0.5 text-xs font-bold">{index + 1}</span>
                    <button
                      type="button"
                      className="absolute right-3 top-3 flex min-h-11 min-w-11 items-center justify-center rounded-full bg-slate-950/80"
                      aria-label={`Remove page ${index + 1}`}
                      onClick={() => setPages((current) => current.filter((item) => item.id !== page.id))}
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      draggable
                      aria-label={`Move page ${index + 1}`}
                      className="mt-2 flex min-h-11 w-full items-center justify-center gap-1 rounded-xl text-xs text-slate-300"
                      onDragStart={() => {
                        dragIndex.current = index;
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') movePage(index, index - 1);
                        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') movePage(index, index + 1);
                      }}
                    >
                      <GripVertical className="h-4 w-4" />
                      Page {index + 1}
                    </button>
                  </div>
                ))}
                {pages.length < INVOICE_PAGE_MAX ? (
                  <button
                    type="button"
                    className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-emerald-700/70 text-sm font-bold text-emerald-300"
                    onClick={() => addRef.current?.click()}
                  >
                    <span className="text-2xl leading-none">+</span>
                    Add page
                  </button>
                ) : null}
              </div>
              <p className="text-xs text-slate-500">
                Photos are shrunk on the phone before upload (same prep as single scans). PDFs become one image per page.
              </p>
            </div>
          ) : null}

          {step === 'scanning' ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 px-3 py-3">
                <p className="text-[11px] font-bold tracking-wide text-slate-400">READING PAGES</p>
                <p className="text-sm font-bold text-slate-100">
                  {readCount} of {view?.pageCount || pages.length || chips.length} done
                </p>
                <p className="text-xs text-slate-400">About 20 seconds per page</p>
              </div>
              {(chips.length > 0
                ? chips
                : pages.map((_, index) => ({ index: index + 1, status: 'scanning' as const }))
              ).map((chip) => (
                  <div key={chip.index} className="space-y-2 rounded-2xl border border-slate-800 bg-slate-900 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-bold">Page {chip.index}</span>
                      <StatusChip status={chip.status} />
                    </div>
                    {'error' in chip && chip.error ? <p className="text-xs text-rose-200">{chip.error}</p> : null}
                    {chip.status === 'failed' || (chip.status === 'pending' && !localImages.current.has(chip.index)) ? (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        {chip.status === 'failed' && localImages.current.has(chip.index) ? (
                          <Button
                            variant="secondary"
                            className="min-h-11 w-full sm:w-auto sm:flex-1"
                            disabled={working}
                            onClick={() => void reread(chip.index, localImages.current.get(chip.index))}
                          >
                            Retry page
                          </Button>
                        ) : null}
                        <Button
                          variant="secondary"
                          className="min-h-11 w-full sm:w-auto sm:flex-1"
                          disabled={working}
                          onClick={() => {
                            retakeIndex.current = chip.index;
                            retakeRef.current?.click();
                          }}
                        >
                          Take photo
                        </Button>
                        <Button
                          variant="secondary"
                          className="min-h-11 w-full sm:w-auto sm:flex-1"
                          disabled={working}
                          onClick={() => {
                            retakeIndex.current = chip.index;
                            retakeLibraryRef.current?.click();
                          }}
                        >
                          Choose photo
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )
              )}
              {!localImages.current.size && chips.some((chip) => chip.status === 'failed' || chip.status === 'pending') ? (
                <p className="text-xs text-slate-400">The photos are not on this phone anymore. Retake the page that failed.</p>
              ) : null}
            </div>
          ) : null}

          {step === 'review' && view ? (
            <div className="space-y-4">
              {view.duplicateNote ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-700/70 bg-emerald-950/40 px-3 py-3 text-sm font-semibold text-emerald-50">
                  <span>{view.duplicateNote}</span>
                  <button type="button" className="min-h-11 shrink-0 font-bold text-emerald-200 underline" disabled={working} onClick={() => void undo()}>
                    Undo
                  </button>
                </div>
              ) : null}
              <SupplierSelect suppliers={suppliers} value={supplierId} onChange={setSupplierId} label="Supplier" />
              {matchSupplierByName(view.vendorName, suppliers).status === 'none' &&
              addOcrSupplierLabel(view.vendorName) ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  disabled={creatingSupplier || working}
                  onClick={() => void addPrintedSupplier()}
                >
                  {creatingSupplier ? 'Adding supplier…' : addOcrSupplierLabel(view.vendorName)}
                </Button>
              ) : null}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Invoice # · date</p>
                <p className="mt-1 font-mono text-sm tabular-nums text-slate-100">
                  {view.invoiceNumber || 'Unread invoice #'}
                  {view.invoiceDate ? ` · ${formatInvoiceDeliveryDay(view.invoiceDate) || view.invoiceDate}` : ''}
                </p>
                <div className="mt-2">
                  <InvoiceDateField
                    value={dateDraft}
                    onChange={(ymd) => {
                      setDateDraft(ymd);
                      setDateConfirmed(true);
                    }}
                  />
                </div>
                {view.invoiceDateNeedsConfirm && !dateConfirmed ? (
                  <p className="mt-2 text-sm font-semibold text-amber-200">
                    {view.invoiceDateConfirmReason || INVOICE_DATE_WARNING}
                  </p>
                ) : null}
              </div>
              <ReviewSummary
                lines={view.lines}
                edits={lineEdits}
                onOpenCheck={(index) => {
                  setShowAllLines(true);
                  setSheet({ index, fromCheck: true });
                }}
              />
              {view.blockers.some((blocker) => isInvoiceLevelBlocker(blocker) || lineBlockerNeedsManager(blocker)) ? (
                <ul className="space-y-1 rounded-xl border border-amber-800/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
                  {view.blockers
                    .filter((blocker) => isInvoiceLevelBlocker(blocker) || lineBlockerNeedsManager(blocker))
                    .map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                </ul>
              ) : null}
              <ul className="divide-y divide-slate-800 rounded-2xl border border-slate-800">
                {view.lines.map((line, index) => ({ line, index }))
                  .filter(({ index }) => showAllLines || index < 3)
                  .map(({ line, index }) => {
                    const choice = lineEdits[index];
                    const supplierLabel = suppliers.find((row) => row.id === supplierId)?.name ?? '';
                    const facts = factsForLine(line, choice);
                    const checkIndexes = reviewCheckIndexes(view.lines, lineEdits);
                    const checkAt = checkIndexes.indexOf(index);
                    const fromCheck = sheet?.fromCheck === true && sheet.index === index;
                    return (
                      <li
                        key={`${line.name}-${index}`}
                        ref={(node) => {
                          if (node) lineRefs.current.set(index, node);
                          else lineRefs.current.delete(index);
                        }}
                        className="px-3 py-2"
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0 truncate font-medium">{line.name}</span>
                          <span className="font-mono text-sm tabular-nums">{money(line.totalCost)}</span>
                        </div>
                        <p className="text-xs text-slate-400">
                          {line.page ? `p${line.page}` : 'p?'}
                          {line.quantity != null && line.unitCost != null
                            ? ` · ${line.quantity} ${line.unit} × ${money(line.unitCost)}`
                            : ''}
                        </p>
                        <ReceiveLineProductMatch
                          productName={null}
                          supplierName={supplierLabel}
                          supplierSaved={Boolean(supplierId)}
                          pickerOpen={sheet?.index === index}
                          remember={choice?.remember !== false}
                          createNew={choice?.createNew === true}
                          showRemember={false}
                          presentation="sheet"
                          pill={receiveLinePill(facts)}
                          onClose={() => setSheet(null)}
                          checkStep={
                            fromCheck
                              ? {
                                  label: `${checkAt + 1} of ${checkIndexes.length}`,
                                  prevDisabled: checkAt <= 0,
                                  nextDisabled: checkAt < 0 || checkAt >= checkIndexes.length - 1,
                                  onPrev: () => {
                                    const prev = checkIndexes[checkAt - 1];
                                    if (prev !== undefined) setSheet({ index: prev, fromCheck: true });
                                  },
                                  onNext: () => {
                                    const next = checkIndexes[checkAt + 1];
                                    if (next !== undefined) setSheet({ index: next, fromCheck: true });
                                  },
                                }
                              : null
                          }
                          onPick={(product) => {
                            setLineEdits((current) => ({
                              ...current,
                              [index]: {
                                productId: product.id,
                                productName: product.name,
                                productPicked: true,
                                remember: current[index]?.remember !== false,
                                unlink: false,
                                createNew: false,
                                pickerOpen: false,
                              },
                            }));
                            setSheet(null);
                          }}
                          onCreateNew={() => {
                            setLineEdits((current) => ({
                              ...current,
                              [index]: {
                                productPicked: false,
                                remember: false,
                                unlink: current[index]?.unlink === true,
                                createNew: true,
                                pickerOpen: false,
                              },
                            }));
                            setSheet(null);
                          }}
                          onChange={() => setSheet({ index, fromCheck: false })}
                          onUnlink={() =>
                            setLineEdits((current) => ({
                              ...current,
                              [index]: {
                                unlink: true,
                                productPicked: false,
                                remember: false,
                                createNew: true,
                                pickerOpen: false,
                              },
                            }))
                          }
                          onRemember={(value) =>
                            setLineEdits((current) => ({
                              ...current,
                              [index]: { ...(current[index] ?? {}), remember: value },
                            }))
                          }
                        />
                      </li>
                    );
                  })}
              </ul>
              {view.lines.length > 3 && !showAllLines ? (
                <button type="button" className="min-h-11 text-sm font-bold text-slate-200" onClick={() => setShowAllLines(true)}>
                  + {view.lines.length - 3} more lines
                </button>
              ) : null}
              <div className="rounded-2xl border border-slate-800 bg-slate-900 px-3 py-3 text-sm">
                <p className="text-[11px] font-bold tracking-wide text-slate-400">
                  {view.totalsFromPage ? `TOTALS · FROM PAGE ${view.totalsFromPage}` : 'TOTALS'}
                </p>
                <TotalRow label="Subtotal" value={view.printedSubtotal} />
                <TotalRow label="HST" value={view.printedHst} />
                <TotalRow label="PST" value={view.printedPst} />
                <div className="mt-1 flex justify-between font-bold">
                  <span>Invoice total</span>
                  <span className="font-mono tabular-nums">{money(invoiceTotal(view))}</span>
                </div>
              </div>
              {showOverride ? (
                <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-950/40 p-4 text-xs text-amber-100">
                  <input
                    type="checkbox"
                    checked={managerApproved}
                    onChange={(event) => setManagerApproved(event.target.checked)}
                    className="mt-1 h-5 w-5 rounded border-amber-400"
                  />
                  <ManagerApprovalText lines={view.lines} />
                </label>
              ) : null}
              {clerkBlocked ? (
                <p className="rounded-2xl border border-rose-900/50 bg-rose-950/30 px-4 py-3 text-xs text-rose-200">
                  {clerkManagerReviewCopy({ lines: view.lines, blockers: view.blockers })}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <footer className="flex gap-2 border-t border-slate-800 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {step === 'choose' ? (
            <Button variant="secondary" className="w-full" onClick={onClose}>
              Cancel
            </Button>
          ) : null}
          {step === 'pages' ? (
            <>
              <Button
                className="flex-1 bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                disabled={pages.length === 0 || preparing || working}
                onClick={() => void startScan()}
              >
                {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Scan invoice · {pages.length} {pages.length === 1 ? 'page' : 'pages'}
              </Button>
              <Button variant="secondary" disabled={working} onClick={resetLocal}>
                Discard pages
              </Button>
            </>
          ) : null}
          {step === 'scanning' ? (
            <>
              {continuable.length > 0 ? (
                <Button
                  className="flex-1 bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                  disabled={working || continueWaitMs > 0}
                  onClick={() => void continueScan()}
                >
                  {continueWaitMs > 0
                    ? `Continue in ${Math.ceil(continueWaitMs / 1000)}s`
                    : `Continue scan · ${continuable.length} ${continuable.length === 1 ? 'page' : 'pages'}`}
                </Button>
              ) : null}
              <Button variant="secondary" className={continuable.length > 0 ? '' : 'w-full'} disabled={working} onClick={() => void discardScan()}>
                Discard scan
              </Button>
            </>
          ) : null}
          {step === 'review' ? (
            <>
              <Button variant="secondary" disabled={working} onClick={() => void discardScan()}>
                Discard scan
              </Button>
              <Button
                className="flex-1 bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                disabled={!supplierId || working || hardBlock || view?.status !== 'ready' || confirmBlocked}
                title={clerkBlocked ? CLERK_MANAGER_REASON : undefined}
                onClick={() => void confirm()}
              >
                {working ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Confirm invoice
              </Button>
            </>
          ) : null}
        </footer>

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            const files = event.target.files;
            if (files) void ingestFiles(files);
            event.target.value = '';
          }}
        />
        <input
          ref={libraryRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = event.target.files;
            if (files) void ingestFiles(files);
            event.target.value = '';
          }}
        />
        <input
          ref={addRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(event) => {
            const files = event.target.files;
            if (files) void ingestFiles(files);
            event.target.value = '';
          }}
        />
        <input
          ref={retakeRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onReplaceFailedPage}
        />
        <input
          ref={retakeLibraryRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={onReplaceFailedPage}
        />
      </div>
    </div>
  );
}

function ManagerApprovalText({ lines }: { lines: ReviewLine[] }) {
  const text = managerApprovalLabel({ lines });
  if (!text.startsWith('Manager approval:')) return <span>{text}</span>;
  const detail = text.slice('Manager approval:'.length).trimStart();
  return (
    <span>
      <span className="font-bold text-amber-200">Manager approval: </span>
      {detail}
    </span>
  );
}

function StatusChip({ status }: { status: InvoicePageStatus }) {
  const tone =
    status === 'read'
      ? 'bg-emerald-400/15 text-emerald-300'
      : status === 'failed'
        ? 'bg-rose-500/15 text-rose-300'
        : status === 'scanning'
          ? 'bg-sky-500/15 text-sky-300'
          : 'bg-slate-800 text-slate-300';
  const label = status === 'read' ? 'Read' : status === 'failed' ? 'Failed' : status === 'scanning' ? 'Scanning…' : 'Waiting';
  return <span className={`rounded-full px-2 py-1 text-xs font-bold ${tone}`}>{label}</span>;
}

function TotalRow({ label, value }: { label: string; value: number | undefined }) {
  if (typeof value !== 'number') return null;
  return (
    <div className="flex justify-between text-slate-300">
      <span>{label}</span>
      <span className="font-mono tabular-nums">{money(value)}</span>
    </div>
  );
}

function flag(value: unknown): boolean {
  return value === true;
}

function factsForLine(line: ReviewLine, choice: InvoiceMatchChoice | undefined): ReceiveLineFacts {
  const createNew = choice?.createNew === true;
  const picked = choice?.productPicked === true && Boolean(choice.productId?.trim());
  const productId = createNew ? '' : picked ? choice?.productId : line.productId;
  return {
    name: line.name,
    quantityUnreadable: line.quantityUnreadable,
    costUnreadable: line.costUnreadable,
    nameUnreadable: line.nameUnreadable,
    unitInvalid: line.unitInvalid,
    lineTotalMismatch: line.lineTotalMismatch,
    departmentAssumed: line.departmentAssumed,
    requiresApproval: line.requiresApproval,
    fuzzyAmbiguous: picked || createNew ? false : line.fuzzyAmbiguous,
    matchSource: picked || createNew ? null : line.matchSource,
    matchPrintedValue: picked || createNew ? null : line.matchPrintedValue,
    productId,
    createNew: createNew || (!picked && !productId?.trim() && line.createNew === true),
  };
}

function reviewCheckIndexes(lines: ReviewLine[], edits: Record<number, InvoiceMatchChoice>): number[] {
  return lines.flatMap((line, index) => (lineNeedsCheck(factsForLine(line, edits[index])) ? [index] : []));
}

function ReviewSummary({
  lines,
  edits,
  onOpenCheck,
}: {
  lines: ReviewLine[];
  edits: Record<number, InvoiceMatchChoice>;
  onOpenCheck: (index: number) => void;
}) {
  const counts = reviewCounts(lines.map((line, index) => factsForLine(line, edits[index])));
  const firstCheck = reviewCheckIndexes(lines, edits)[0];
  const checkLabel = `Check ${counts.check}`;
  return (
    <p className="rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-100">
      {`Matched ${counts.matched} · New ${counts.created} · `}
      {counts.check > 0 && firstCheck !== undefined ? (
        <button type="button" className="min-h-11 font-semibold underline" onClick={() => onOpenCheck(firstCheck)}>
          {checkLabel}
        </button>
      ) : (
        checkLabel
      )}
    </p>
  );
}

function money(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function invoiceTotal(view: ScanView): number | undefined {
  const lineAmounts = view.lines.map((line) => line.totalCost);
  const hasLine = lineAmounts.some((amount) => typeof amount === 'number' && Number.isFinite(amount));
  const hasPrinted = typeof view.printedSubtotal === 'number' && view.printedSubtotal > 0;
  if (!hasPrinted && !hasLine) return undefined;
  return selectInvoiceHeaderTotal({
    printedSubtotal: view.printedSubtotal,
    lineAmounts,
  });
}

function asLines(value: unknown): ReviewLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const line = item as InvoiceLineItemExtract;
    const name = typeof line.name === 'string' ? line.name : '';
    if (!name) return [];
    return [
      {
        name,
        page: typeof line.page === 'number' ? line.page : undefined,
        quantity: typeof line.quantity === 'number' ? line.quantity : undefined,
        unit: typeof line.unit === 'string' && line.unit ? line.unit : 'units',
        unitCost: typeof line.unitCost === 'number' ? line.unitCost : undefined,
        totalCost: typeof line.totalCost === 'number' ? line.totalCost : undefined,
        productId: typeof line.productId === 'string' ? line.productId : null,
        productName: typeof line.matchedProductName === 'string' ? line.matchedProductName : null,
        supplierCode: typeof line.supplierCode === 'string' ? line.supplierCode : null,
        matchSource:
          line.matchSource === 'code' || line.matchSource === 'learned_name' || line.matchSource === 'name'
            ? line.matchSource
            : null,
        matchPrintedValue: typeof line.matchPrintedValue === 'string' ? line.matchPrintedValue : null,
        quantityUnreadable: flag(line.quantityUnreadable),
        costUnreadable: flag(line.costUnreadable),
        nameUnreadable: flag(line.nameUnreadable),
        unitInvalid: flag(line.unitInvalid),
        lineTotalMismatch: flag(line.lineTotalMismatch),
        departmentAssumed: flag(line.departmentAssumed),
        requiresApproval: flag(line.requires_approval),
        fuzzyAmbiguous: flag(line.fuzzyAmbiguous),
        createNew: flag(line.createNew),
      },
    ];
  });
}

function viewFromRestored(scan: RestoredInvoiceScan): ScanView {
  const pageScan = scan.pageScan;
  return {
    draftId: scan.draftId ?? '',
    status: pageScan?.scanStatus === 'ready' && pageScan.scanAudited ? 'ready' : pageScan?.scanStatus === 'failed' ? 'failed' : 'scanning',
    pageCount: pageScan?.pageCount ?? pageScan?.pages.length ?? 0,
    pages: pageScan?.pages ?? [],
    dedupedCount: pageScan?.dedupedCount ?? 0,
    dedupedFrom: pageScan?.dedupedFrom ?? [],
    duplicateNote: pageScan?.duplicateNote || duplicateRemovalNote(pageScan?.dedupedCount ?? 0, pageScan?.dedupedFrom ?? []),
    totalsFromPage: pageScan?.totalsFromPage ?? null,
    ...(pageScan?.printedSubtotal !== undefined ? { printedSubtotal: pageScan.printedSubtotal } : {}),
    ...(pageScan?.printedHst !== undefined ? { printedHst: pageScan.printedHst } : {}),
    ...(pageScan?.printedPst !== undefined ? { printedPst: pageScan.printedPst } : {}),
    blockers: [...(pageScan?.blockers ?? []), ...(pageScan?.reviewFlags ?? [])],
    reviewFlags: pageScan?.reviewFlags ?? [],
    vendorName: scan.vendorName,
    invoiceNumber: scan.invoiceNumber,
    invoiceDate: scan.invoiceDate,
    invoiceDateNeedsConfirm: pageScan?.invoiceDateNeedsConfirm === true,
    ...(pageScan?.invoiceDateConfirmReason ? { invoiceDateConfirmReason: pageScan.invoiceDateConfirmReason } : {}),
    lines: asLines(scan.lineItems),
  };
}

function viewFromPost(json: Record<string, unknown>): ScanView | null {
  const draftId = typeof json.draftId === 'string' ? json.draftId : '';
  if (!draftId) return null;
  const status = json.status === 'ready' || json.status === 'failed' || json.status === 'scanning' ? json.status : 'scanning';
  const data = json.data && typeof json.data === 'object' ? (json.data as Record<string, unknown>) : null;
  const pages = Array.isArray(json.pages)
    ? json.pages.flatMap((page) => {
        if (!page || typeof page !== 'object') return [];
        const chip = page as { index?: unknown; status?: unknown; error?: unknown };
        if (typeof chip.index !== 'number') return [];
        const chipStatus: InvoicePageStatus =
          chip.status === 'read' || chip.status === 'failed' || chip.status === 'scanning' || chip.status === 'pending'
            ? chip.status
            : 'pending';
        return [{ index: chip.index, status: chipStatus, ...(typeof chip.error === 'string' ? { error: chip.error } : {}) }];
      })
    : [];
  const dedupedFrom = Array.isArray(json.dedupedFrom) ? json.dedupedFrom.filter((page): page is number => typeof page === 'number') : [];
  const dedupedCount = typeof json.dedupedCount === 'number' ? json.dedupedCount : 0;
  return {
    draftId,
    status,
    pageCount: typeof json.pageCount === 'number' ? json.pageCount : pages.length,
    pages,
    dedupedCount,
    dedupedFrom,
    duplicateNote: typeof json.duplicateNote === 'string' ? json.duplicateNote : duplicateRemovalNote(dedupedCount, dedupedFrom),
    totalsFromPage: typeof json.totalsFromPage === 'number' ? json.totalsFromPage : null,
    ...(typeof json.printedSubtotal === 'number' ? { printedSubtotal: json.printedSubtotal } : {}),
    ...(typeof json.printedHst === 'number' ? { printedHst: json.printedHst } : {}),
    ...(typeof json.printedPst === 'number' ? { printedPst: json.printedPst } : {}),
    blockers: Array.isArray(json.blockers) ? json.blockers.filter((item): item is string => typeof item === 'string') : [],
    reviewFlags: Array.isArray(json.reviewFlags) ? json.reviewFlags.filter((item): item is string => typeof item === 'string') : [],
    vendorName: typeof data?.vendorName === 'string' ? data.vendorName : '',
    invoiceNumber: typeof data?.invoiceNumber === 'string' ? data.invoiceNumber : '',
    ...readPostedInvoiceDate({ ...json, ...(data ? { data } : {}) }),
    lines: asLines(data?.lineItems),
  };
}

'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { DepartmentBadge } from '@/components/ui/DepartmentBadge';
import { useRole } from '@/components/auth/RoleProvider';
import { notifyInventoryUpdated } from '@/lib/domains/inventory/inventoryMoveClient';
import { locationLabel } from '@/lib/domains/inventory/locationLabel';
import { OfflineSyncBadge } from '@/components/ui/OfflineSyncBadge';
import { postJsonOrQueue } from '@/lib/offline/mutationClient';
import { createClientMutationId } from '@/lib/offline/queue';
import { OFFLINE_MUTATION_KIND } from '@/lib/offline/types';
import { DepartmentType } from '@/lib/types';
import { ModalBody, ModalFooter, ModalHeader, ModalShell } from '@/components/ui/layout';
import { PushToTalkRecorder, VOICE_MAX_RECORDING_SECONDS } from '@/lib/features/voiceCapture';
import { postVoiceLoggerParse } from '@/lib/features/voiceLoggerClient';
import type { VoicePipelinePhase } from '@/lib/features/voicePipelineUi';
import { VoicePipelineStatusBar } from '@/components/ui/VoicePipelineStatusBar';
import { VoicePipelineErrorBanner } from '@/components/ui/VoicePipelineErrorBanner';
import {
  Mic,
  Square,
  Sparkles,
  X,
  AlertOctagon,
  CheckCircle2,
  Volume2,
  ArrowRightLeft,
  Trash2,
  Loader2,
  Edit3,
  ShieldAlert,
  Check,
  RotateCcw,
} from 'lucide-react';

// ============================================================================
// Strict Types for Phase 5 Async Voice Confirmation Loop
// ============================================================================

export type VoiceActionType = 'PULL_RESCUE' | 'DISCARD';

export interface FuzzyAlternativeOption {
  product_id: string;
  product_name: string;
  department: DepartmentType;
  similarity_score: number;
}

export interface EditableVoiceDraftItem {
  item_name: string;
  product_id: string;
  matched_product_name: string | null;
  match_confidence: number;
  is_exact_match: boolean;
  requires_disambiguation: boolean;
  quantity: number;
  unit: string;
  condition: string;
  target_action: VoiceActionType;
  department: DepartmentType;
  alternatives: FuzzyAlternativeOption[];
  allergen_warnings: string[];
}

export interface ConfirmedVoiceCommitResult {
  items: EditableVoiceDraftItem[];
  transcript: string;
  committedAt: string;
}

interface VoiceLoggerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVoiceConfirmed?: (result: ConfirmedVoiceCommitResult) => void;
}

function inferDepartmentFromName(name: string): DepartmentType {
  const lower = name.toLowerCase();
  if (/cream|milk|yogurt|cheese|butter|egg/.test(lower)) return 'DAIRY';
  if (/bread|sourdough|boule|loaf|pastry|bun|bakery/.test(lower)) return 'BAKERY';
  if (/oil|olive|spice|grain|rice|pasta|sauce/.test(lower)) return 'PANTRY';
  return 'PRODUCE';
}

const FALLBACK_CATALOG_OPTIONS: Array<{
  id: string;
  name: string;
  department: DepartmentType;
}> = [
  { id: 'prod-avocado-hass', name: 'Avocados Hass (Mexico)', department: 'PRODUCE' },
  { id: 'prod-tomato-hothouse', name: 'Hot House Tomatoes (Ontario)', department: 'PRODUCE' },
  { id: 'prod-tomato-cocktail', name: 'Cocktail Tomatoes', department: 'PRODUCE' },
  { id: 'prod-apple-honeycrisp', name: 'Honey Crisp Apples', department: 'PRODUCE' },
  { id: 'prod-cilantro', name: 'Fresh Cilantro Bunch', department: 'PRODUCE' },
  { id: 'prod-jalapeno', name: 'Jalapeno Peppers', department: 'PRODUCE' },
  { id: 'prod-heavy-cream', name: 'Whole Heavy Cream 40%', department: 'DAIRY' },
  { id: 'prod-greek-yogurt', name: 'Greek Whole Milk Yogurt (750g)', department: 'DAIRY' },
  { id: 'prod-sourdough-boule', name: 'Artisanal Sourdough Boule', department: 'BAKERY' },
  { id: 'prod-evoo-5l', name: 'Extra Virgin Olive Oil (Bulk Production)', department: 'PANTRY' },
];

export const VoiceLoggerModal: React.FC<VoiceLoggerModalProps> = ({
  isOpen,
  onClose,
  onVoiceConfirmed,
}) => {
  const { activeUser } = useRole();
  const [catalogOptions, setCatalogOptions] = useState(FALLBACK_CATALOG_OPTIONS);
  const [isRecording, setIsRecording] = useState(false);
  const [toggleRecordMode, setToggleRecordMode] = useState(false);
  const [processingAudio, setProcessingAudio] = useState(false);
  const [pipelinePhase, setPipelinePhase] = useState<VoicePipelinePhase>('idle');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [lastAudioBlob, setLastAudioBlob] = useState<Blob | null>(null);
  const [spokenText, setSpokenText] = useState(
    'Pull 12 very ripe Hass avocados for production rescue and discard 3 lbs of crushed tomatoes'
  );
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);

  // Async Confirmation Loop States:
  // STEP 1: 'CAPTURE' -> STEP 2: 'CONFIRM_LOOP' (View / Edit) -> STEP 3: 'COMMITTED'
  const [step, setStep] = useState<'CAPTURE' | 'CONFIRM_LOOP' | 'COMMITTED'>(
    'CAPTURE'
  );
  const [isEditMode, setIsEditMode] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [draftItems, setDraftItems] = useState<EditableVoiceDraftItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedOffline, setSavedOffline] = useState(false);
  const [catalogLoadWarning, setCatalogLoadWarning] = useState<string | null>(null);

  const pttRecorderRef = useRef<PushToTalkRecorder | null>(null);
  const holdActiveRef = useRef(false);
  const parseVoiceRef = useRef<(audioBlob?: Blob | null) => void>(() => {});

  useEffect(() => {
    if (!isOpen) return;
    setCatalogLoadWarning(null);
    void fetch('/api/inventory/levels', { cache: 'no-store' })
      .then(async (r) => {
        const json = (await r.json()) as {
          success?: boolean;
          levels?: Array<{ productId: string; name: string; supplier?: string }>;
          error?: string;
        };
        if (!r.ok || !json.success) {
          setCatalogLoadWarning(json.error ?? 'Could not load catalog for voice match.');
          return;
        }
        if (!Array.isArray(json.levels)) return;
        const opts = json.levels.map((row) => ({
          id: row.productId,
          name: row.name,
          department: inferDepartmentFromName(row.name),
        }));
        if (opts.length > 0) setCatalogOptions(opts);
      })
      .catch((err: unknown) => {
        setCatalogLoadWarning('Network error — using fallback catalog.');
        console.error('[freshloop] VoiceLoggerModal catalog fetch', err);
      });
  }, [isOpen]);

  const productOptionsForItem = useMemo(() => {
    return (item: EditableVoiceDraftItem) => {
      const map = new Map(catalogOptions.map((o) => [o.id, o]));
      for (const alt of item.alternatives) {
        map.set(alt.product_id, {
          id: alt.product_id,
          name: alt.product_name,
          department: alt.department as DepartmentType,
        });
      }
      if (item.product_id && item.matched_product_name) {
        map.set(item.product_id, {
          id: item.product_id,
          name: item.matched_product_name,
          department: item.department,
        });
      }
      return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
    };
  }, [catalogOptions]);

  const resetClosedSession = useCallback(() => {
    pttRecorderRef.current?.cancel();
    pttRecorderRef.current = null;
    setIsRecording(false);
    setProcessingAudio(false);
    setPipelinePhase('idle');
    setRecordingSeconds(0);
    setLastAudioBlob(null);
    setParsing(false);
    setStep('CAPTURE');
    setIsEditMode(false);
    setTranscript('');
    setDraftItems([]);
    setErrorMsg(null);
    setSavedOffline(false);
  }, []);

  useEffect(() => {
    if (!isOpen) resetClosedSession();
  }, [isOpen, resetClosedSession]);

  const dismiss = () => {
    resetClosedSession();
    onClose();
  };

  if (!isOpen) return null;

  const wireRecorderCallbacks = (recorder: PushToTalkRecorder) => {
    recorder.setCallbacks({
      onDurationTick: (elapsed, max) => {
        setRecordingSeconds(elapsed);
        setPipelinePhase('recording');
      },
      onMaxDurationReached: (blob) => {
        setIsRecording(false);
        setRecordingSeconds(0);
        if (blob && blob.size > 0) {
          setLastAudioBlob(blob);
          setPipelinePhase('compressing');
          parseVoiceRef.current(blob);
        } else {
          setPipelinePhase('idle');
          setErrorMsg('The time limit was reached with no audio captured.');
        }
      },
    });
  };

  const ensureRecorder = () => {
    if (!pttRecorderRef.current) {
      pttRecorderRef.current = new PushToTalkRecorder();
    }
    wireRecorderCallbacks(pttRecorderRef.current);
    return pttRecorderRef.current;
  };

  const beginRecording = async () => {
    if (parsing || processingAudio) return;
    setErrorMsg(null);
    setRecordingSeconds(0);
    try {
      await ensureRecorder().start();
      setIsRecording(true);
      setPipelinePhase('recording');
    } catch {
      setIsRecording(false);
      setPipelinePhase('idle');
      setErrorMsg('Could not access the microphone. Use the text box or check permissions.');
    }
  };

  const finishRecording = async (autoParse: boolean) => {
    const recorder = pttRecorderRef.current;
    if (!recorder?.active && !isRecording) return;
    setIsRecording(false);
    setRecordingSeconds(0);
    const blob = await recorder?.stop().catch(() => null);
    if (blob && blob.size > 0) {
      setLastAudioBlob(blob);
      if (autoParse) {
        setPipelinePhase('compressing');
        void handleParseVoiceWithAI(blob);
      } else {
        setPipelinePhase('idle');
      }
    } else if (autoParse) {
      setPipelinePhase('idle');
      setErrorMsg('No audio was captured. Hold the button while you speak, or type in the box.');
    } else {
      setPipelinePhase('idle');
    }
  };

  const handleMicPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (toggleRecordMode || parsing || processingAudio) return;
    event.preventDefault();
    holdActiveRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    void beginRecording();
  };

  const handleMicPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (toggleRecordMode || !holdActiveRef.current) return;
    holdActiveRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    void finishRecording(true);
  };

  const handleMicClick = () => {
    if (!toggleRecordMode) return;
    if (isRecording) {
      void finishRecording(true);
    } else {
      void beginRecording();
    }
  };

  // STEP 1 -> STEP 2: Whisper transcript + LLM parse via /api/voice-logger (no ledger write)
  const handleParseVoiceWithAI = async (audioBlob?: Blob | null) => {
    const blob = audioBlob ?? lastAudioBlob;
    setParsing(true);
    const hasAudio = Boolean(blob && blob.size > 0);
    setProcessingAudio(hasAudio);
    setErrorMsg(null);
    if (hasAudio) {
      if (pipelinePhase !== 'compressing') setPipelinePhase('compressing');
      setPipelinePhase('uploading');
      setPipelinePhase('transcribing');
    } else {
      setPipelinePhase('parsing');
    }
    try {
      const res = await postVoiceLoggerParse({
        audioBlob: blob,
        spokenText,
      });

      setPipelinePhase('parsing');
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        message?: string;
        transcript?: string;
        items?: unknown[];
      };
      if (!res.ok || !json.success) {
        throw new Error(
          json.error ||
            json.message ||
            (res.status === 503
              ? 'Voice service is unavailable. Check OPENAI_API_KEY on the server.'
              : 'Could not parse the voice command.')
        );
      }

      setTranscript(json.transcript || spokenText);

      const rawItems: EditableVoiceDraftItem[] = Array.isArray(json.items)
        ? (json.items as Record<string, unknown>[]).map((it) => ({
            item_name: String(it.item_name || 'Product'),
            product_id: it.product_id ? String(it.product_id) : '',
            matched_product_name: it.matched_product_name
              ? String(it.matched_product_name)
              : null,
            match_confidence: Number(it.match_confidence ?? 0.9),
            is_exact_match: Boolean(it.is_exact_match),
            requires_disambiguation: Boolean(it.requires_disambiguation),
            quantity: Number(it.quantity) > 0 ? Number(it.quantity) : 1,
            unit: String(it.unit || 'units'),
            condition: String(it.condition || 'Overripe'),
            target_action:
              it.target_action === 'DISCARD' ? 'DISCARD' : 'PULL_RESCUE',
            department: (['PRODUCE', 'DAIRY', 'BAKERY', 'PANTRY'].includes(
              String(it.department)
            )
              ? String(it.department)
              : 'PRODUCE') as DepartmentType,
            alternatives: Array.isArray(it.alternatives)
              ? (it.alternatives as FuzzyAlternativeOption[])
              : [],
            allergen_warnings: Array.isArray(it.allergen_warnings)
              ? it.allergen_warnings.map(String)
              : [],
          }))
        : [];

      setDraftItems(rawItems);
      setIsEditMode(false);
      setStep('CONFIRM_LOOP');
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Fallo al procesar audio con IA'
      );
    } finally {
      setParsing(false);
      setProcessingAudio(false);
      setPipelinePhase('idle');
    }
  };
  parseVoiceRef.current = (audioBlob) => {
    void handleParseVoiceWithAI(audioBlob);
  };

  // STEP 2 -> STEP 3: Physical user confirmation [CONFIRMAR Y REGISTRAR] writes to DB
  const handleConfirmAndCommit = async () => {
    setCommitting(true);
    setErrorMsg(null);
    const missingProduct = draftItems.some((item) => !item.product_id?.trim());
    if (missingProduct) {
      setErrorMsg('Select a catalog product for each line before confirming.');
      setCommitting(false);
      return;
    }
    try {
      const clientMutationId = createClientMutationId();
      const result = await postJsonOrQueue<{ success?: boolean; error?: string }>({
        kind: OFFLINE_MUTATION_KIND.VOICE_COMMIT,
        url: '/api/voice-logger',
        label: 'Voice floor log',
        body: {
          confirmCommit: true,
          staffId: activeUser?.id ?? 'staff-floor-voice',
          transcript,
          clientMutationId,
          confirmedItems: draftItems.map((item) => ({
            product_id: item.product_id,
            quantity: item.quantity,
            target_action: item.target_action,
            condition: item.condition,
          })),
        },
      });

      if (!result.ok) {
        throw new Error(result.error || 'Ledger commit failed.');
      }

      if (result.offline) {
        setSavedOffline(true);
      } else if (!result.data.success) {
        throw new Error(result.data.error || 'Ledger commit failed.');
      }

      notifyInventoryUpdated();
      if (draftItems.some((i) => i.target_action === 'PULL_RESCUE')) {
        window.dispatchEvent(new CustomEvent('freshloop-kitchen-inbox'));
      }

      setStep('COMMITTED');
      onVoiceConfirmed?.({
        items: draftItems,
        transcript,
        committedAt: new Date().toISOString(),
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not commit to the ledger.');
    } finally {
      setCommitting(false);
    }
  };

  const updateDraftItem = (
    index: number,
    updates: Partial<EditableVoiceDraftItem>
  ) => {
    setDraftItems((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, ...updates } : item))
    );
  };

  const handleReset = () => {
    setStep('CAPTURE');
    setIsEditMode(false);
    setDraftItems([]);
    setErrorMsg(null);
    setSavedOffline(false);
  };

  return (
    <ModalShell
      open={isOpen}
      onClose={dismiss}
      width="md"
      panelClassName="max-w-2xl rounded-3xl border-zinc-800 bg-zinc-900"
    >
        <ModalHeader className="border-zinc-800 bg-zinc-950/70 px-5 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-teal-500/10 border border-teal-500/30 text-teal-400">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base sm:text-lg text-white">
                  Voice Floor Logger
                </h3>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-teal-950 text-teal-300 border border-teal-500/40">
                  Async Confirmation Loop
                </span>
                <OfflineSyncBadge />
              </div>
              <p className="text-xs text-zinc-400">
                Push-to-talk (Whisper) + parser LLM • Nothing is saved until you confirm
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={dismiss}
            className="relative z-30 pointer-events-auto min-h-11 min-w-11 cursor-pointer rounded-xl p-2 text-zinc-400 transition-all hover:bg-zinc-800 hover:text-white"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        </ModalHeader>

        <ModalBody className="space-y-5 p-5 text-xs text-zinc-200 sm:p-6">
          {catalogLoadWarning ? (
            <div className="rounded-2xl border border-amber-600/40 bg-amber-950/50 px-3.5 py-2.5 text-amber-200">
              {catalogLoadWarning}
            </div>
          ) : null}
          {errorMsg ? (
            <VoicePipelineErrorBanner
              message={errorMsg}
              onRetry={() => void handleParseVoiceWithAI(lastAudioBlob)}
              retryLabel={lastAudioBlob?.size ? 'Retry audio' : 'Retry parse'}
              onDismiss={() => setErrorMsg(null)}
            />
          ) : null}

          {/* ============================================================== */}
          {/* STEP 1: VOICE CAPTURE                                          */}
          {/* ============================================================== */}
          {step === 'CAPTURE' && (
            <div className="space-y-5">
              <div className="flex flex-col items-center justify-center py-8 px-4 bg-zinc-950/60 border border-zinc-800/90 rounded-2xl text-center">
                <VoicePipelineStatusBar
                  phase={pipelinePhase}
                  recordingSeconds={recordingSeconds}
                  maxRecordingSeconds={VOICE_MAX_RECORDING_SECONDS}
                  className="mb-4 w-full max-w-sm"
                />
                <div className="relative mb-5">
                  {isRecording && (
                    <div className="absolute inset-0 rounded-full bg-rose-500/35 animate-ping" />
                  )}
                  <button
                    type="button"
                    aria-pressed={isRecording}
                    aria-busy={parsing || processingAudio}
                    disabled={parsing || processingAudio}
                    onPointerDown={handleMicPointerDown}
                    onPointerUp={handleMicPointerUp}
                    onPointerCancel={handleMicPointerUp}
                    onPointerLeave={(e) => {
                      if (holdActiveRef.current) handleMicPointerUp(e);
                    }}
                    onClick={handleMicClick}
                    className={`relative z-10 flex h-20 w-20 min-h-12 min-w-12 touch-none select-none items-center justify-center rounded-full shadow-2xl transition-all cursor-pointer ${
                      isRecording
                        ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/40 scale-105'
                        : 'bg-gradient-to-tr from-teal-500 to-emerald-400 text-zinc-950 shadow-teal-500/30 hover:scale-105'
                    }`}
                  >
                    {isRecording ? (
                      <Square className="w-8 h-8 fill-white" />
                    ) : (
                      <Mic className="w-9 h-9" />
                    )}
                  </button>
                </div>

                <p className="font-extrabold text-sm text-white">
                  {processingAudio || parsing
                    ? 'Transcribing with Whisper and parsing the command…'
                    : isRecording
                      ? toggleRecordMode
                        ? 'Recording… tap again to finish'
                        : 'Hold and speak… release to send'
                      : toggleRecordMode
                        ? 'Tap the microphone to record a short note'
                        : 'Hold the microphone — push-to-talk voice note'}
                </p>
                <button
                  type="button"
                  onClick={() => setToggleRecordMode((v) => !v)}
                  className="mt-2 text-[10px] font-bold uppercase tracking-wider text-teal-400/90 hover:text-teal-300"
                >
                  Mode: {toggleRecordMode ? 'Tap to start/stop' : 'Hold to talk (recommended)'}
                </button>
                <p className="text-zinc-400 text-xs mt-1 max-w-md">
                  The model extracts products, matches them to the catalog, and opens a confirmation step before anything hits the ledger.
                </p>
              </div>

              {/* Spoken Text Simulator Input */}
              <div className="space-y-2">
                <label className="font-bold text-zinc-300 text-xs flex items-center justify-between">
                  <span>Spoken text / quick voice simulator</span>
                  <span className="text-teal-400 font-mono text-[10px]">
                    Whisper + text (no streaming)
                  </span>
                </label>
                <textarea
                  rows={2}
                  value={spokenText}
                  onChange={(e) => setSpokenText(e.target.value)}
                  placeholder="Example: Pull 15 lbs of ripe tomatoes for production and discard 2 moldy sourdough loaves..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-teal-500/60"
                />
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* STEP 2: ASYNC CONFIRMATION LOOP ([CONFIRMAR Y REGISTRAR] / [EDITAR]) */}
          {/* ============================================================== */}
          {step === 'CONFIRM_LOOP' && (
            <div className="space-y-5">
              {/* Safeguard Banner */}
              <div className="p-4 rounded-2xl bg-amber-950/50 border border-amber-500/50 flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-amber-300 text-xs uppercase tracking-wider">
                      Confirmation required before posting
                    </span>
                  </div>
                  <p className="text-amber-100/90 text-xs leading-relaxed">
                    Check what the model heard. Press{' '}
                    <strong className="text-white">[EDIT]</strong> to fix quantity, action, or the linked product before{' '}
                    <strong className="text-emerald-300">[CONFIRM AND POST]</strong> to{' '}
                    <code className="font-mono">Inventory_Transactions</code>.
                  </p>
                </div>
              </div>

              {/* Transcript Box */}
              <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Volume2 className="w-4 h-4 text-teal-400 shrink-0" />
                  <div>
                    <span className="text-[10px] font-bold uppercase text-zinc-500 block">
                      Audio interpreted by the model
                    </span>
                    <p className="text-xs font-semibold text-white italic">
                      &ldquo;{transcript}&rdquo;
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-700 text-[10px] font-mono text-zinc-300 shrink-0">
                  {draftItems.length} item(s) detected
                </span>
              </div>

              {/* Parsed Items List (Read-Only or Editable Mode) */}
              <div className="space-y-3">
                {draftItems.map((item, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-2xl border transition-all space-y-3 ${
                      isEditMode
                        ? 'bg-zinc-950 border-teal-500/60 shadow-lg'
                        : 'bg-zinc-950/80 border-zinc-800'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <DepartmentBadge department={item.department} size="sm" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-white text-sm">
                              {item.matched_product_name || item.item_name}
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-950 text-teal-300 border border-teal-500/30">
                              Match {(item.match_confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-400">
                            Heard: &ldquo;{item.item_name}&rdquo; • ID:{' '}
                            <code className="text-zinc-300">{item.product_id}</code>
                          </p>
                        </div>
                      </div>

                      {/* Target Action Badge */}
                      <div>
                        {item.target_action === 'PULL_RESCUE' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/40 text-[11px] font-extrabold">
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                            PULL_RESCUE (Retail → Production prep)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-950 text-rose-300 border border-rose-500/40 text-[11px] font-extrabold">
                            <Trash2 className="w-3.5 h-3.5" />
                            DISCARD (Sales floor → {locationLabel('Waste_Bin')})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* View vs Edit Controls */}
                    {!isEditMode ? (
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-800/80 text-xs">
                        <div className="p-2 rounded-xl bg-zinc-900/70">
                          <span className="text-[10px] text-zinc-500 block">
                            Quantity
                          </span>
                          <strong className="text-white font-mono">
                            {item.quantity} {item.unit}
                          </strong>
                        </div>
                        <div className="p-2 rounded-xl bg-zinc-900/70">
                          <span className="text-[10px] text-zinc-500 block">
                            Condition
                          </span>
                          <strong className="text-amber-300">
                            {item.condition}
                          </strong>
                        </div>
                        <div className="p-2 rounded-xl bg-zinc-900/70">
                          <span className="text-[10px] text-zinc-500 block">
                            Ledger destination
                          </span>
                          <strong className="text-emerald-300 font-mono">
                            {item.target_action === 'PULL_RESCUE'
                              ? 'Production prep'
                              : locationLabel('Waste_Bin')}
                          </strong>
                        </div>
                      </div>
                    ) : (
                      /* Interactive Edit Controls when [EDITAR] is toggled */
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-zinc-800">
                        <div>
                          <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">
                            Catalog product (fuzzy match)
                          </label>
                          <select
                            value={item.product_id}
                            onChange={(e) => {
                              const found = productOptionsForItem(item).find(
                                (p) => p.id === e.target.value
                              );
                              updateDraftItem(idx, {
                                product_id: e.target.value,
                                matched_product_name:
                                  found?.name || item.matched_product_name,
                                department:
                                  found?.department || item.department,
                              });
                            }}
                            className="min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-xs text-white"
                          >
                            {productOptionsForItem(item).map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">
                            Quantity ({item.unit})
                          </label>
                          <input
                            type="number"
                            min={0.1}
                            step={0.5}
                            value={item.quantity}
                            onChange={(e) =>
                              updateDraftItem(idx, {
                                quantity: Math.max(
                                  0.1,
                                  Number(e.target.value) || 1
                                ),
                              })
                            }
                            className="min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs tabular-nums text-white"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">
                            Destination action
                          </label>
                          <select
                            value={item.target_action}
                            onChange={(e) =>
                              updateDraftItem(idx, {
                                target_action: e.target
                                  .value as VoiceActionType,
                              })
                            }
                            className="min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-xs font-bold text-white"
                          >
                            <option value="PULL_RESCUE">
                              PULL_RESCUE (Production)
                            </option>
                            <option value="DISCARD">
                              DISCARD (Waste)
                            </option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* STEP 3: COMMITTED SUCCESS STATE                                */}
          {/* ============================================================== */}
          {step === 'COMMITTED' && (
            <div className="py-8 px-4 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-400/50 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <div className="space-y-1">
                <h4 className="text-lg font-black text-white">
                  Confirmed and posted to the ledger
                </h4>
                <p className="text-xs text-zinc-400 max-w-md mx-auto">
                  {savedOffline ? (
                    <>
                      Saved offline — syncing when Wi‑Fi returns.{' '}
                      <strong className="text-amber-300">{draftItems.length}</strong> moves queued with your confirmation.
                    </>
                  ) : (
                    <>
                      <strong className="text-emerald-400">{draftItems.length}</strong> human-checked moves were posted to{' '}
                      <code className="text-zinc-200">Inventory_Transactions</code>.
                    </>
                  )}
                </p>
              </div>
            </div>
          )}
        </ModalBody>

        <ModalFooter className="flex flex-wrap items-center justify-between gap-3 border-zinc-800 bg-zinc-950/90 px-5 py-4 sm:px-6">
          {step === 'CAPTURE' && (
            <>
              <button
                type="button"
                onClick={dismiss}
                className="relative z-30 pointer-events-auto inline-flex min-h-11 items-center rounded-xl px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => handleParseVoiceWithAI()}
                disabled={parsing}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-black bg-gradient-to-r from-teal-500 to-emerald-400 hover:from-teal-400 hover:to-emerald-300 text-zinc-950 shadow-lg shadow-teal-500/25 transition-all cursor-pointer"
              >
                {parsing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>
                      {processingAudio
                        ? 'Whisper + parser…'
                        : 'Parsing text…'}
                    </span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 fill-zinc-950" />
                    <span>Process voice (open confirmation)</span>
                  </>
                )}
              </button>
            </>
          )}

          {step === 'CONFIRM_LOOP' && (
            <>
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2 text-xs font-bold text-zinc-400 hover:text-white cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Record again</span>
              </button>

              <div className="flex items-center gap-2.5">
                {/* PHYSICAL [EDITAR] BUTTON */}
                <button
                  type="button"
                  onClick={() => setIsEditMode((prev) => !prev)}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-4 py-2.5 text-xs font-extrabold transition-all cursor-pointer ${
                    isEditMode
                      ? 'bg-teal-500/20 border-teal-400 text-teal-200'
                      : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-200'
                  }`}
                >
                  <Edit3 className="w-4 h-4" />
                  <span>{isEditMode ? '[SAVE EDIT]' : '[EDIT]'}</span>
                </button>

                {/* PHYSICAL [CONFIRMAR Y REGISTRAR] BUTTON */}
                <button
                  type="button"
                  onClick={handleConfirmAndCommit}
                  disabled={committing}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-black bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-zinc-950 shadow-lg shadow-emerald-500/30 transition-all active:scale-95 cursor-pointer"
                >
                  {committing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Posting to the ledger...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>[CONFIRM AND POST]</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {step === 'COMMITTED' && (
            <div className="w-full flex items-center justify-between">
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex min-h-11 items-center rounded-xl px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white cursor-pointer"
              >
                Log another note
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="inline-flex min-h-11 items-center rounded-xl px-6 py-2.5 text-xs font-black bg-emerald-400 hover:bg-emerald-300 text-zinc-950 cursor-pointer"
              >
                Close and refresh the floor
              </button>
            </div>
          )}
        </ModalFooter>
    </ModalShell>
  );
};

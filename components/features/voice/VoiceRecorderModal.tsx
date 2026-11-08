'use client';

import React, { useState, useRef, useEffect } from 'react';
import { VoiceLoggerResult } from '@/lib/types';
import { DepartmentBadge } from '@/components/ui/DepartmentBadge';
import { PushToTalkRecorder, VOICE_MAX_RECORDING_SECONDS } from '@/lib/features/voiceCapture';
import { postVoiceLoggerParse } from '@/lib/features/voiceLoggerClient';
import type { VoicePipelinePhase } from '@/lib/features/voicePipelineUi';
import { VoicePipelineStatusBar } from '@/components/ui/VoicePipelineStatusBar';
import { VoicePipelineErrorBanner } from '@/components/ui/VoicePipelineErrorBanner';
import { Mic, Square, Sparkles, X, AlertOctagon, Volume2, ArrowRightLeft, Tag, Trash2, Loader2 } from 'lucide-react';
import { ModalBody, ModalFooter, ModalHeader, ModalShell } from '@/components/ui/layout';

interface VoiceRecorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVoiceLogged: () => void;
}

export const VoiceRecorderModal: React.FC<VoiceRecorderModalProps> = ({
  isOpen,
  onClose,
  onVoiceLogged
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [toggleRecordMode, setToggleRecordMode] = useState(false);
  const [spokenText, setSpokenText] = useState('Logged 10 lbs bruised apples and 4L heavy cream');
  const [loading, setLoading] = useState(false);
  const [processingAudio, setProcessingAudio] = useState(false);
  const [pipelinePhase, setPipelinePhase] = useState<VoicePipelinePhase>('idle');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceResult, setVoiceResult] = useState<VoiceLoggerResult | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);
  const [lastAudioBlob, setLastAudioBlob] = useState<Blob | null>(null);

  const pttRecorderRef = useRef<PushToTalkRecorder | null>(null);
  const holdActiveRef = useRef(false);
  const processVoiceRef = useRef<(audioBlob?: Blob | null) => void>(() => {});

  useEffect(() => {
    if (!isOpen) {
      pttRecorderRef.current?.cancel();
      pttRecorderRef.current = null;
      setIsRecording(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const ensureRecorder = () => {
    if (!pttRecorderRef.current) {
      pttRecorderRef.current = new PushToTalkRecorder();
    }
    pttRecorderRef.current.setCallbacks({
      onDurationTick: (elapsed) => {
        setRecordingSeconds(elapsed);
        setPipelinePhase('recording');
      },
      onMaxDurationReached: (blob) => {
        setIsRecording(false);
        setRecordingSeconds(0);
        if (blob?.size) {
          setLastAudioBlob(blob);
          setPipelinePhase('compressing');
          processVoiceRef.current(blob);
        } else {
          setPipelinePhase('idle');
          setProcessError('Recording hit the time limit with no usable audio.');
        }
      },
    });
    return pttRecorderRef.current;
  };

  const beginRecording = async () => {
    if (loading) return;
    setProcessError(null);
    setRecordingSeconds(0);
    try {
      await ensureRecorder().start();
      setIsRecording(true);
      setPipelinePhase('recording');
    } catch (err) {
      console.warn('Microphone access unavailable:', err);
      setIsRecording(false);
      setPipelinePhase('idle');
      setProcessError('Microphone unavailable. Type your log below or check browser permissions.');
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
        void handleProcessVoice(blob);
      } else {
        setPipelinePhase('idle');
      }
    } else if (autoParse) {
      setPipelinePhase('idle');
      setProcessError('No audio captured. Hold the mic button while speaking.');
    } else {
      setPipelinePhase('idle');
    }
  };

  const handleMicPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (toggleRecordMode || loading) return;
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
    if (isRecording) void finishRecording(true);
    else void beginRecording();
  };

  const handleProcessVoice = async (audioBlob?: Blob | null) => {
    const blob = audioBlob ?? lastAudioBlob;
    setLoading(true);
    const hasAudio = Boolean(blob && blob.size > 0);
    setProcessingAudio(hasAudio);
    setProcessError(null);
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
        data?: VoiceLoggerResult;
        error?: string;
        message?: string;
      };
      if (!res.ok || !json.success) {
        setProcessError(
          json.error ||
            json.message ||
            (res.status === 503
              ? 'Voice service unavailable — check OPENAI_API_KEY on the server.'
              : 'Voice log could not be processed. Try again.')
        );
        return;
      }
      if (json.data) {
        setVoiceResult(json.data);
        onVoiceLogged();
        return;
      }
      setProcessError('Voice log could not be processed. Try again.');
    } catch (err) {
      console.error('Voice logger processing error:', err);
      setProcessError('Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
      setProcessingAudio(false);
      setPipelinePhase('idle');
    }
  };
  processVoiceRef.current = (audioBlob) => {
    void handleProcessVoice(audioBlob);
  };

  return (
    <ModalShell
      open={isOpen}
      onClose={onClose}
      width="md"
      panelClassName="max-w-2xl rounded-3xl border-zinc-800 bg-zinc-900 animate-fadeIn"
    >
        <ModalHeader className="border-zinc-800 bg-zinc-950/60 px-4 py-3.5 sm:px-6 sm:py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="p-2 sm:p-2.5 rounded-2xl bg-teal-500/10 border border-teal-500/30 text-teal-400">
              <Mic className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-white">Voice Floor Note</h3>
              <p className="text-[10px] sm:text-xs text-zinc-400">Push-to-talk • Whisper transcript • LLM parse</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 rounded-xl p-1.5 text-zinc-400 transition-all hover:bg-zinc-800 hover:text-zinc-200 sm:p-2"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        </ModalHeader>

        <ModalBody className="space-y-4 p-4 text-xs text-zinc-200 sm:space-y-6 sm:p-6">
          {processError ? (
            <VoicePipelineErrorBanner
              message={processError}
              onRetry={() => void handleProcessVoice(lastAudioBlob)}
              retryLabel={lastAudioBlob?.size ? 'Retry recording' : 'Retry parse'}
              onDismiss={() => setProcessError(null)}
            />
          ) : null}
          {!voiceResult ? (
            <div className="space-y-6">
              <div className="flex flex-col items-center justify-center py-8 px-4 bg-zinc-950/50 border border-zinc-800/80 rounded-2xl text-center">
                <VoicePipelineStatusBar
                  phase={pipelinePhase}
                  recordingSeconds={recordingSeconds}
                  maxRecordingSeconds={VOICE_MAX_RECORDING_SECONDS}
                  className="mb-4 w-full max-w-sm"
                />
                <div className="relative mb-6">
                  {isRecording && (
                    <div className="absolute inset-0 rounded-full bg-teal-500/30 animate-ping" />
                  )}
                  <button
                    type="button"
                    aria-pressed={isRecording}
                    aria-busy={loading}
                    disabled={loading}
                    onPointerDown={handleMicPointerDown}
                    onPointerUp={handleMicPointerUp}
                    onPointerCancel={handleMicPointerUp}
                    onPointerLeave={(e) => {
                      if (holdActiveRef.current) handleMicPointerUp(e);
                    }}
                    onClick={handleMicClick}
                    className={`relative z-10 flex h-20 w-20 min-h-12 min-w-12 touch-none select-none items-center justify-center rounded-full shadow-xl transition-all ${
                      isRecording
                        ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/30 scale-105'
                        : 'bg-gradient-to-tr from-teal-500 to-emerald-400 text-zinc-950 shadow-teal-500/30 hover:scale-105'
                    }`}
                  >
                    {isRecording ? <Square className="w-8 h-8 fill-white" /> : <Mic className="w-9 h-9" />}
                  </button>
                </div>

                <p className="font-bold text-sm text-white">
                  {loading
                    ? processingAudio
                      ? 'Transcribing with Whisper and parsing…'
                      : 'Parsing spoken text…'
                    : isRecording
                      ? 'Recording… release to send'
                      : 'Hold Record Voice Note or switch to tap mode'}
                </p>
                <button
                  type="button"
                  onClick={() => setToggleRecordMode((v) => !v)}
                  className="mt-2 text-[10px] font-bold uppercase tracking-wider text-teal-400/90 hover:text-teal-300"
                >
                  Mode: {toggleRecordMode ? 'Tap to start/stop' : 'Hold to talk (recommended)'}
                </button>
              </div>

              <div className="space-y-2">
                <label className="font-semibold text-zinc-400 text-xs flex items-center justify-between">
                  <span>Fallback typed log (no mic)</span>
                  <span className="text-teal-400 font-mono text-[10px]">Text-only parse</span>
                </label>
                <input
                  type="text"
                  value={spokenText}
                  onChange={(e) => setSpokenText(e.target.value)}
                  placeholder="Type spoken text (e.g., Logged 15 lbs ripe Roma tomatoes and 3 sourdough loaves)"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-teal-500/50"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-teal-400" /> Audio Transcript
                  </span>
                  {voiceResult.targetAction === 'KITCHEN_RESCUE' && (
                    <span className="px-3 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/40 text-xs font-extrabold flex items-center gap-1">
                      <ArrowRightLeft className="w-3.5 h-3.5" /> Target Action: KITCHEN RESCUE
                    </span>
                  )}
                  {voiceResult.targetAction === 'MARKDOWN' && (
                    <span className="px-3 py-1 rounded-full bg-rose-950 text-rose-300 border border-rose-500/40 text-xs font-extrabold flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5" /> Target Action: MARKDOWN
                    </span>
                  )}
                  {voiceResult.targetAction === 'DISCARD' && (
                    <span className="px-3 py-1 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700 text-xs font-extrabold flex items-center gap-1">
                      <Trash2 className="w-3.5 h-3.5" /> Target Action: DISCARD
                    </span>
                  )}
                </div>

                <p className="text-sm font-semibold text-white italic">
                  &ldquo;{voiceResult.transcript}&rdquo;
                </p>

                {voiceResult.kitchenRescueNotes ? (
                  <p className="text-xs text-teal-300/90 bg-teal-950/40 p-2.5 rounded-xl border border-teal-500/30">
                    Production note: {voiceResult.kitchenRescueNotes}
                  </p>
                ) : null}
              </div>

              <div>
                <h5 className="font-bold text-zinc-400 uppercase text-[10px] tracking-wider mb-2">Parsed Spoken Items ({voiceResult.parsedItems.length})</h5>
                <div className="space-y-2">
                  {voiceResult.parsedItems.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                      <div className="flex items-center gap-3">
                        <DepartmentBadge department={item.department} size="sm" />
                        <div>
                          <p className="font-bold text-white text-xs">{item.name}</p>
                          <p className="text-[11px] text-zinc-400">{item.quantity} {item.unit} • Condition: {item.condition}</p>
                        </div>
                      </div>

                      {item.allergenWarnings.length > 0 ? (
                        <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-950/80 border border-rose-500/30 text-rose-300 text-[10px] font-bold">
                          <AlertOctagon className="w-3 h-3 text-rose-400" />
                          <span>Allergen: {item.allergenWarnings.join(', ')}</span>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </ModalBody>

        <ModalFooter className="flex items-center justify-between border-zinc-800 bg-zinc-950/80 p-4">
          <button
            type="button"
            onClick={() => {
              setVoiceResult(null);
              setLastAudioBlob(null);
            }}
            className="inline-flex min-h-11 items-center rounded-xl px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200"
          >
            {voiceResult ? 'Record Another Log' : 'Cancel'}
          </button>

          {!voiceResult ? (
            <button
              type="button"
              onClick={() => void handleProcessVoice()}
              disabled={loading}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-400 px-5 py-2.5 text-xs font-bold text-zinc-950 shadow-lg shadow-teal-500/25 transition-all hover:from-teal-400 hover:to-emerald-300 sm:min-h-12"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{processingAudio ? 'Whisper + parser…' : 'Parsing…'}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 fill-zinc-950" />
                  <span>Parse typed log</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 items-center rounded-xl bg-teal-400 px-5 py-2.5 text-xs font-bold text-zinc-950 shadow-lg hover:bg-teal-300 sm:min-h-12"
            >
              Done
            </button>
          )}
        </ModalFooter>
    </ModalShell>
  );
};

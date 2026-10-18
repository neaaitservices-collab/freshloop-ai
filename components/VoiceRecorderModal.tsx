'use client';

import React, { useState, useRef } from 'react';
import { VoiceLoggerResult } from '@/lib/types';
import { DepartmentBadge } from './DepartmentBadge';
import { Mic, Square, Sparkles, X, AlertOctagon, CheckCircle2, Volume2, ArrowRightLeft, Tag, Trash2, Loader2 } from 'lucide-react';

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
  const [spokenText, setSpokenText] = useState('Logged 10 lbs bruised apples and 4L heavy cream');
  const [loading, setLoading] = useState(false);
  const [voiceResult, setVoiceResult] = useState<VoiceLoggerResult | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  if (!isOpen) return null;

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          handleProcessVoice(base64);
        };
        reader.readAsDataURL(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.warn('Microphone access unavailable, defaulting to text floor log:', err);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleProcessVoice = async (audioBase64?: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/voice-logger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64,
          spokenText: spokenText,
          autoSave: true
        })
      });

      const json = await res.json();
      if (json.success && json.data) {
        setVoiceResult(json.data);
        onVoiceLogged();
      }
    } catch (err) {
      console.error('Voice logger processing error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="p-2 sm:p-2.5 rounded-2xl bg-teal-500/10 border border-teal-500/30 text-teal-400">
              <Mic className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-white">Ambient Voice Floor Logger</h3>
              <p className="text-[10px] sm:text-xs text-zinc-400">Hands-Free Kitchen Transfer & Spoilage Parser</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 text-zinc-200 text-xs overflow-y-auto">
          {!voiceResult ? (
            <div className="space-y-6">
              {/* Mic Graphic & Pulse */}
              <div className="flex flex-col items-center justify-center py-8 px-4 bg-zinc-950/50 border border-zinc-800/80 rounded-2xl text-center">
                <div className="relative mb-6">
                  {isRecording && (
                    <div className="absolute inset-0 rounded-full bg-teal-500/30 animate-ping" />
                  )}
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center shadow-xl transition-all ${
                      isRecording
                        ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/30 scale-105'
                        : 'bg-gradient-to-tr from-teal-500 to-emerald-400 text-zinc-950 shadow-teal-500/30 hover:scale-105'
                    }`}
                  >
                    {isRecording ? <Square className="w-8 h-8 fill-white" /> : <Mic className="w-9 h-9" />}
                  </button>
                </div>

                <p className="font-bold text-sm text-white">
                  {isRecording ? 'Listening to Kitchen Floor Voice Transfer...' : 'Click Mic to Record Spoken Floor Log'}
                </p>
                <p className="text-zinc-500 text-xs mt-1">
                  Example: "Logged 10 lbs bruised apples and 4L heavy cream from Walk-in Cooler B"
                </p>
              </div>

              {/* Or Direct Spoken Input Text */}
              <div className="space-y-2">
                <label className="font-semibold text-zinc-400 text-xs flex items-center justify-between">
                  <span>Spoken Transfer Text / Quick Speech Simulator</span>
                  <span className="text-teal-400 font-mono text-[10px]">Gemini Audio Multimodal</span>
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
            /* Parsed Voice Result */
            <div className="space-y-5">
              {/* Transcript & Action */}
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-teal-400" /> Audio Transcript
                  </span>
                  {/* Action Badge */}
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
                  "{voiceResult.transcript}"
                </p>
                
                {voiceResult.kitchenRescueNotes && (
                  <p className="text-xs text-teal-300/90 bg-teal-950/40 p-2.5 rounded-xl border border-teal-500/30">
                    💡 <strong>Kitchen Note:</strong> {voiceResult.kitchenRescueNotes}
                  </p>
                )}
              </div>

              {/* Parsed Items List */}
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

                      {item.allergenWarnings.length > 0 && (
                        <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-950/80 border border-rose-500/30 text-rose-300 text-[10px] font-bold">
                          <AlertOctagon className="w-3 h-3 text-rose-400" />
                          <span>Allergen: {item.allergenWarnings.join(', ')}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-950/80 flex items-center justify-between">
          <button
            onClick={() => setVoiceResult(null)}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-zinc-200"
          >
            {voiceResult ? 'Record Another Log' : 'Cancel'}
          </button>

          {!voiceResult ? (
            <button
              onClick={() => handleProcessVoice()}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-teal-500 to-emerald-400 hover:from-teal-400 hover:to-emerald-300 text-zinc-950 shadow-lg shadow-teal-500/25 transition-all"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Parsing Audio with Gemini...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 fill-zinc-950" />
                  <span>Parse Spoken Floor Log</span>
                </>
              )}
            </button>
          ) : (
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-teal-400 hover:bg-teal-300 text-zinc-950 shadow-lg"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

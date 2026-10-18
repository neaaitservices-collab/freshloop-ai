'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Sliders, Mic, Sparkles, Printer, ArrowRight, CheckCircle, Package } from 'lucide-react';

interface YieldWorkflowStepperProps {
  onOpenInvoiceModal: () => void;
  onOpenVoiceModal: () => void;
  onTriggerRecipeFusion?: () => void;
  affectedItemCount: number;
  recipeCount: number;
}

export const YieldWorkflowStepper: React.FC<YieldWorkflowStepperProps> = ({
  onOpenInvoiceModal,
  onOpenVoiceModal,
  onTriggerRecipeFusion,
  affectedItemCount,
  recipeCount
}) => {
  const router = useRouter();
  const [activeStep, setActiveStep] = useState<number>(1);

  const steps = [
    {
      id: 1,
      name: 'Intake & Case OCR',
      desc: 'Scan receipt; define 1 Case = 40 lb/ml/unit/kg',
      icon: FileText,
      badge: 'Wholesale OCR',
      actionLabel: 'Scan Invoice',
      action: onOpenInvoiceModal,
      accentColor: 'from-blue-500 to-cyan-500',
      borderColor: 'border-blue-500/40',
      bgColor: 'bg-blue-950/40'
    },
    {
      id: 2,
      name: 'Floor Pull Sensitivity',
      desc: 'Set 2, 3, or 4 day pull thresholds',
      icon: Sliders,
      badge: `${affectedItemCount} Items Flagged`,
      actionLabel: 'Go to Rescue Hub',
      action: () => router.push('/rescue'),
      accentColor: 'from-amber-500 to-yellow-500',
      borderColor: 'border-amber-500/40',
      bgColor: 'bg-amber-950/40'
    },
    {
      id: 3,
      name: 'Voice Floor Logger',
      desc: 'Speak floor transfers into structured logs',
      icon: Mic,
      badge: 'Ambient AI',
      actionLabel: 'Voice Transfer',
      action: onOpenVoiceModal,
      accentColor: 'from-teal-500 to-emerald-500',
      borderColor: 'border-teal-500/40',
      bgColor: 'bg-teal-950/40'
    },
    {
      id: 4,
      name: 'AI Recipe Fusion',
      desc: 'Cross-match Produce + Dairy + Bakery',
      icon: Sparkles,
      badge: `${recipeCount} Active Recipes`,
      actionLabel: 'Go to Recipes',
      action: () => router.push('/recipes'),
      accentColor: 'from-emerald-500 to-teal-500',
      borderColor: 'border-emerald-500/40',
      bgColor: 'bg-emerald-950/40'
    },
    {
      id: 5,
      name: 'Deli Label & Profit',
      desc: 'Print Grab-n-Go stickers with barcodes',
      icon: Printer,
      badge: '75%+ Gross Margin',
      actionLabel: 'View Deli Tags',
      action: () => router.push('/recipes'),
      accentColor: 'from-purple-500 to-pink-500',
      borderColor: 'border-purple-500/40',
      bgColor: 'bg-purple-950/40'
    }
  ];

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-2xl backdrop-blur-xl space-y-5">
      {/* Workflow Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              End-to-End Grocery Yield Workflow
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-black text-white tracking-tight flex items-center gap-2">
            Store Manager 5-Stage Rescue Lifecycle
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            From receiving wholesale cases to scanning OCR, logging floor audio, fusing recipes, and printing deli labels.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400 bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-800">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>Active Flow: Step {activeStep} of 5</span>
        </div>
      </div>

      {/* 5-Step Cards - Horizontal snap scroll on mobile (375px), grid on tablet/desktop */}
      <div className="flex sm:grid sm:grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-3 overflow-x-auto pb-2 sm:pb-0 snap-x snap-mandatory no-scrollbar -mx-1 px-1">
        {steps.map((step) => {
          const StepIcon = step.icon;
          const isActive = activeStep === step.id;

          return (
            <div
              key={step.id}
              onClick={() => {
                setActiveStep(step.id);
                step.action();
              }}
              className={`group relative p-3 sm:p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-2.5 shrink-0 w-[200px] sm:w-auto snap-center ${
                isActive
                  ? `${step.bgColor} ${step.borderColor} ring-2 ring-emerald-500/30 shadow-lg scale-[1.01]`
                  : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900/70'
              }`}
            >
              {/* Step Number & Badge */}
              <div className="flex items-center justify-between">
                <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg sm:rounded-xl flex items-center justify-center text-xs font-black bg-gradient-to-r ${step.accentColor} text-zinc-950 shadow-md`}>
                  {step.id}
                </div>
                <span className="text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-900 text-zinc-300 border border-zinc-700 truncate max-w-[120px]">
                  {step.badge}
                </span>
              </div>

              {/* Title & Description */}
              <div>
                <h3 className="font-bold text-white text-xs sm:text-sm group-hover:text-emerald-300 transition-colors flex items-center gap-1.5">
                  <StepIcon className="w-3.5 h-3.5 text-zinc-400 group-hover:text-emerald-400 shrink-0" />
                  <span className="truncate">{step.name}</span>
                </h3>
                <p className="text-[10px] sm:text-[11px] text-zinc-400 leading-snug mt-0.5 line-clamp-2">
                  {step.desc}
                </p>
              </div>

              {/* Trigger Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveStep(step.id);
                  step.action();
                }}
                className={`w-full py-1.5 px-2 rounded-xl text-[10px] sm:text-[11px] font-bold flex items-center justify-center gap-1 transition-all ${
                  isActive
                    ? 'bg-emerald-500 text-zinc-950 shadow-md hover:bg-emerald-400'
                    : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white border border-zinc-800'
                }`}
              >
                <span>{step.actionLabel}</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>
      
      {/* Mobile Swipe Guidance indicator */}
      <div className="flex sm:hidden items-center justify-center gap-1.5 pt-0.5">
        {steps.map((step) => (
          <button
            key={step.id}
            onClick={() => {
              setActiveStep(step.id);
              step.action();
            }}
            className={`h-1 rounded-full transition-all ${
              activeStep === step.id ? 'w-5 bg-emerald-400' : 'w-1.5 bg-zinc-700'
            }`}
            aria-label={`Go to step ${step.id}`}
          />
        ))}
      </div>
    </div>
  );
};

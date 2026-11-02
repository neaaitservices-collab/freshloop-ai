'use client';

import React from 'react';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import type { ExecutiveScenario } from '@/lib/domains/executive/types';
import { cn } from '@/lib/utils/cn';

function SliderField({
  label,
  hint,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-bold text-slate-300">{label}</span>
        <span className="font-mono text-xs font-black text-emerald-300">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(
          'mt-2 h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-800',
          '[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none',
          '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-400'
        )}
      />
      <p className="mt-1 text-[10px] leading-snug text-slate-500">{hint}</p>
    </label>
  );
}

export function ExecutiveScenarioPanel({
  scenario,
  onChange,
}: {
  scenario: ExecutiveScenario;
  onChange: (next: ExecutiveScenario) => void;
}) {
  const patch = (partial: Partial<ExecutiveScenario>) => onChange({ ...scenario, ...partial });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Scenario modeling</CardTitle>
        <CardDescription>
          Drag sliders to stress-test labor, waste, and shrink — charts and KPIs update instantly.
        </CardDescription>
      </CardHeader>
      <CardBody className="space-y-5">
        <SliderField
          label="Waste improvement"
          hint="Additional waste reduction vs today (percentage points)."
          value={scenario.wasteImprovementPts}
          min={0}
          max={8}
          step={0.5}
          format={(v) => `${v.toFixed(1)} pts`}
          onChange={(wasteImprovementPts) => patch({ wasteImprovementPts })}
        />
        <SliderField
          label="Shrink reduction"
          hint="% cut to baseline waste/shrink dollars in the optimized column."
          value={scenario.shrinkReductionPct}
          min={0}
          max={40}
          step={1}
          format={(v) => `${v}%`}
          onChange={(shrinkReductionPct) => patch({ shrinkReductionPct })}
        />
        <SliderField
          label="Labor hours saved / week"
          hint="Floor rescue, smarter pulls, less rework."
          value={scenario.laborHoursSavedPerWeek}
          min={0}
          max={24}
          step={1}
          format={(v) => `${v} h`}
          onChange={(laborHoursSavedPerWeek) => patch({ laborHoursSavedPerWeek })}
        />
        <SliderField
          label="Loaded labor rate"
          hint="Fully loaded hourly cost for savings math."
          value={scenario.laborRatePerHour}
          min={15}
          max={45}
          step={1}
          format={(v) => `$${v}/hr`}
          onChange={(laborRatePerHour) => patch({ laborRatePerHour })}
        />
      </CardBody>
    </Card>
  );
}

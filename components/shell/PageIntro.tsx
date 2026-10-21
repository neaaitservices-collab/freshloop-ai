'use client';

import React from 'react';

export function PageIntro({
  step,
  title,
  description,
  action,
}: {
  step: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300">{step}</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-400">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

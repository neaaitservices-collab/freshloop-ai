'use client';

import Link from 'next/link';
import { ArrowRight, Settings2 } from 'lucide-react';

export function StoreSettingsEntryCard() {
  return (
    <section className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300">
            <Settings2 className="h-4 w-4" />
            Store settings
          </p>
          <h2 className="mt-1 text-xl font-black text-white">Waste goal, pulls, scrap &amp; receiving</h2>
          <p className="mt-1 max-w-xl text-sm text-zinc-400">
            Open the dedicated settings page instead of scrolling this dashboard. Bucket $, pull window,
            and invoice alerts live there.
          </p>
        </div>
        <Link
          href="/admin/settings"
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-zinc-950 transition hover:bg-emerald-300"
        >
          Open settings
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

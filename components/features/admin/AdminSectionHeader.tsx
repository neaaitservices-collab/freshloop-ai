'use client';

import Link from 'next/link';
import { Settings } from 'lucide-react';
import { AdminViewTabs } from '@/components/features/admin/AdminViewTabs';

const focusRing =
  'focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400';

/** Admin title, the Settings page, and the inline section tabs. */
export function AdminSectionHeader({ titleTag = 'h1' }: { titleTag?: 'h1' | 'p' }) {
  const Title = titleTag;
  return (
    <header className="mb-3">
      <div className="flex items-center justify-between gap-3 pb-1">
        <Title className="text-[22px] font-extrabold tracking-tight text-white">Admin</Title>
        <Link
          href="/admin/settings"
          prefetch={false}
          aria-label="Settings"
          className={`inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border border-slate-800 bg-slate-900 px-3 text-[13px] font-bold text-slate-200 ${focusRing}`}
        >
          <Settings className="h-4 w-4" aria-hidden />
          Settings
        </Link>
      </div>
      <AdminViewTabs />
    </header>
  );
}

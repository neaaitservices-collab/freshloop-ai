'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

const TABS = [
  { href: '/admin/executive', label: 'Executive ROI' },
  { href: '/admin', label: 'Operations' },
] as const;

export function AdminViewTabs() {
  const pathname = usePathname();

  return (
    <nav
      className="flex rounded-xl border border-slate-800 bg-slate-950/80 p-1"
      aria-label="Admin views"
    >
      {TABS.map((tab) => {
        const active =
          tab.href === '/admin/executive'
            ? pathname.startsWith('/admin/executive')
            : pathname === '/admin';
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'rounded-lg px-3 py-2 text-xs font-black transition',
              active ? 'bg-emerald-400 text-slate-950' : 'text-slate-400 hover:text-slate-200'
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

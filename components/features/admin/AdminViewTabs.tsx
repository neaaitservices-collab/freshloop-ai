'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

const TABS = [
  { href: '/admin/executive', label: 'Executive ROI' },
  { href: '/admin', label: 'Operations' },
  { href: '/admin/suppliers', label: 'Suppliers' },
  { href: '/admin/departments', label: 'Departments' },
] as const;

export function AdminViewTabs() {
  const pathname = usePathname();

  return (
    <nav
      className="grid grid-cols-2 gap-1 overflow-x-clip rounded-xl border border-slate-800 bg-slate-950/80 p-1 sm:flex sm:gap-0 sm:overflow-x-auto"
      aria-label="Admin views"
    >
      {TABS.map((tab) => {
        const active =
          tab.href === '/admin/executive'
            ? pathname.startsWith('/admin/executive')
            : tab.href === '/admin/suppliers'
              ? pathname.startsWith('/admin/suppliers')
              : tab.href === '/admin/departments'
                ? pathname.startsWith('/admin/departments')
                : pathname === '/admin';
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'min-w-0 rounded-lg px-3 py-2 text-center text-xs font-black leading-tight break-words transition focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:shrink-0 sm:break-normal sm:text-left sm:leading-4',
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

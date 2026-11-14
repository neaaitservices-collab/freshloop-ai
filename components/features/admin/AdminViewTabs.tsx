'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

const TABS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/executive', label: 'ROI' },
  { href: '/admin/suppliers', label: 'Suppliers' },
  { href: '/admin/departments', label: 'Departments' },
] as const;

export type AdminViewHref = (typeof TABS)[number]['href'];

export function isAdminViewTabActive(pathname: string, href: AdminViewHref): boolean {
  if (href === '/admin/executive') return pathname.startsWith('/admin/executive');
  if (href === '/admin/suppliers') return pathname.startsWith('/admin/suppliers');
  if (href === '/admin/departments') return pathname.startsWith('/admin/departments');
  return pathname === '/admin';
}

export function selectedAdminViewHref(pathname: string): AdminViewHref | '' {
  return TABS.find((tab) => isAdminViewTabActive(pathname, tab.href))?.href ?? '';
}

/** Client route change for an admin tab. Unknown values are ignored. */
export function pushAdminView(push: (href: string) => void, href: string): void {
  const match = TABS.find((tab) => tab.href === href);
  if (match) push(match.href);
}

const focusRing =
  'focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400';

export function AdminViewTabs() {
  const pathname = usePathname();

  return (
    <nav className="-mx-3 overflow-x-auto border-b border-slate-800 px-3 sm:mx-0 sm:px-0" aria-label="Admin views">
      <ul className="flex gap-1.5">
        {TABS.map((tab) => {
          const active = isAdminViewTabActive(pathname, tab.href);
          return (
            <li key={tab.href} className="shrink-0">
              <Link
                href={tab.href}
                prefetch={false}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-1 mr-2.5 py-2 text-[13px] font-bold',
                  focusRing,
                  active
                    ? 'border-emerald-400 text-slate-50'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

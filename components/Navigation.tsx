'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChefHat,
  ClipboardList,
  Leaf,
  Mic,
  Package,
  PanelLeft,
  User,
  Users,
  Warehouse,
} from 'lucide-react';
import { useRole } from '@/components/auth/RoleProvider';
import { isManager, ROLE_LABELS, type RoleName } from '@/lib/roles';

type NavIcon = React.ComponentType<{ className?: string }>;

interface NavItem {
  id: string;
  label: string;
  icon: NavIcon;
  href?: string;
  voice?: boolean;
  roles: RoleName[];
}

const ITEMS: NavItem[] = [
  { id: 'receive', label: 'Receive', icon: Package, href: '/receive', roles: ['ADMIN', 'STORE_MANAGER', 'RECEIVING_CLERK'] },
  {
    id: 'inventory',
    label: 'Inventory',
    icon: Warehouse,
    href: '/inventory',
    roles: ['ADMIN', 'STORE_MANAGER', 'RECEIVING_CLERK', 'FLOOR_STAFF'],
  },
  { id: 'voice', label: 'Voice', icon: Mic, voice: true, roles: ['ADMIN', 'STORE_MANAGER', 'FLOOR_STAFF'] },
  { id: 'kitchen', label: 'Kitchen', icon: ChefHat, href: '/kitchen', roles: ['ADMIN', 'STORE_MANAGER', 'DELI_CHEF'] },
  { id: 'orders', label: 'Orders', icon: ClipboardList, href: '/orders', roles: ['ADMIN', 'STORE_MANAGER'] },
  {
    id: 'account',
    label: 'Admin',
    icon: Users,
    href: '/admin',
    roles: ['ADMIN', 'STORE_MANAGER', 'RECEIVING_CLERK', 'FLOOR_STAFF', 'DELI_CHEF'],
  },
];

function displayItem(item: NavItem, role: RoleName | null): NavItem {
  if (item.id === 'account' && role && !isManager(role)) {
    return { ...item, label: 'Profile', icon: User };
  }
  return item;
}

function brandHref(items: NavItem[], role: RoleName | null): string {
  if (!role || isManager(role)) return '/admin';
  return items.find((item) => item.href && item.id !== 'account')?.href ?? '/admin';
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function itemsFor(role: RoleName | null): NavItem[] {
  const visible = !role
    ? ITEMS.filter((item) => item.roles.includes('ADMIN'))
    : ITEMS.filter((item) => item.roles.includes(role));
  if (!role || isManager(role)) {
    return [...visible].sort((a, b) => Number(b.id === 'account') - Number(a.id === 'account'));
  }
  return visible;
}

export function Navigation({ onVoice }: { onVoice: () => void }) {
  const pathname = usePathname();
  const { users, activeUser, setActiveUserId } = useRole();
  const [collapsed, setCollapsed] = useState(false);
  const items = itemsFor(activeUser?.role ?? null);

  return (
    <>
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 md:flex ${
          collapsed ? 'w-[72px]' : 'w-56'
        }`}
      >
        <div className={`flex items-center gap-2 px-3 py-4 ${collapsed ? 'justify-center' : ''}`}>
          <Link href={brandHref(items, activeUser?.role ?? null)} className="flex items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400 text-zinc-950">
              <Leaf className="h-5 w-5" />
            </span>
            {collapsed ? null : <span className="text-base font-black text-white">FreshLoop</span>}
          </Link>
        </div>
        <nav className="flex-1 space-y-1 px-2">
          {items.map((item) => {
            const shown = displayItem(item, activeUser?.role ?? null);
            return (
              <NavRow
                key={shown.id}
                item={shown}
                active={shown.href ? isActive(pathname, shown.href) : false}
                collapsed={collapsed}
                onVoice={onVoice}
              />
            );
          })}
        </nav>
        <div className="space-y-2 border-t border-zinc-800 p-2">
          {collapsed ? null : (
            <label className="block px-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Acting as
              <select
                aria-label="Acting as"
                value={activeUser?.id ?? ''}
                onChange={(event) => setActiveUserId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-xs font-bold text-white"
              >
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((current) => !current)}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-2 py-2 text-xs font-bold text-zinc-400 hover:bg-zinc-900"
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            <PanelLeft className="h-4 w-4" />
            {collapsed ? null : 'Collapse'}
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950/95 px-3 py-3 backdrop-blur-xl md:hidden">
        <Link href={brandHref(items, activeUser?.role ?? null)} className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400 text-zinc-950">
            <Leaf className="h-4 w-4" />
          </span>
          <span className="text-sm font-black text-white">FreshLoop</span>
        </Link>
        <select
          aria-label="Acting as"
          value={activeUser?.id ?? ''}
          onChange={(event) => setActiveUserId(event.target.value)}
          className="max-w-[11rem] rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-xs font-bold text-white"
        >
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} · {ROLE_LABELS[user.role]}
            </option>
          ))}
        </select>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800 bg-zinc-950/95 px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-xl md:hidden">
        <ul className="flex overflow-x-auto">
          {items.map((item) => {
            const shown = displayItem(item, activeUser?.role ?? null);
            const Icon = shown.icon;
            const active = shown.href ? isActive(pathname, shown.href) : false;
            const className = `flex min-w-[4.25rem] flex-1 flex-col items-center gap-0.5 px-1 py-1 text-[10px] font-bold ${
              active ? 'text-emerald-300' : 'text-zinc-400'
            }`;
            if (shown.voice) {
              return (
                <li key={shown.id} className="flex flex-1">
                  <button type="button" onClick={onVoice} className={className}>
                    <Icon className="h-5 w-5" />
                    Voice
                  </button>
                </li>
              );
            }
            return (
              <li key={shown.id} className="flex flex-1">
                <Link href={shown.href ?? '/admin'} className={className}>
                  <Icon className="h-5 w-5" />
                  {shown.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

function NavRow({
  item,
  active,
  collapsed,
  onVoice,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onVoice: () => void;
}) {
  const Icon = item.icon;
  const className = `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition hover:text-white ${
    collapsed ? 'justify-center' : ''
  } ${active ? 'bg-emerald-400 text-zinc-950 hover:text-zinc-950' : 'text-zinc-300 hover:bg-zinc-900'}`;
  if (item.voice) {
    return (
      <button type="button" onClick={onVoice} className={className} title="Voice">
        <Icon className="h-4 w-4 shrink-0" />
        {collapsed ? null : 'Voice'}
      </button>
    );
  }
  return (
    <Link href={item.href ?? '/admin'} className={className} title={item.label}>
      <Icon className="h-4 w-4 shrink-0" />
      {collapsed ? null : item.label}
    </Link>
  );
}

'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChefHat,
  ClipboardList,
  Ellipsis,
  Leaf,
  Mic,
  Package,
  PanelLeft,
  User,
  Users,
  Warehouse,
  Truck,
} from 'lucide-react';
import { useRole } from '@/components/auth/RoleProvider';
import { navItemsForRole, type NavItem } from '@/lib/navigation/navItems';
import { splitPhoneNav, visiblePhoneNavItems } from '@/lib/navigation/phoneNav';
import { homePathForRole } from '@/lib/utils/roleRouting';
import { isManager, ROLE_LABELS, type RoleName } from '@/lib/utils/roles';

type NavIcon = React.ComponentType<{ className?: string }>;

const ICONS: Record<string, NavIcon> = {
  receive: Package,
  suppliers: Truck,
  inventory: Warehouse,
  voice: Mic,
  production: ChefHat,
  orders: ClipboardList,
  account: Users,
};

interface ShownNavItem extends NavItem {
  icon: NavIcon;
}

function withIcon(item: NavItem, role: RoleName | null): ShownNavItem {
  const icon = item.id === 'account' && role && !isManager(role) ? User : (ICONS[item.id] ?? User);
  return { ...item, icon };
}

function brandHref(role: RoleName | null): string {
  return homePathForRole(role ?? undefined);
}

function isActive(pathname: string, href: string) {
  if (href === '/admin' && pathname.startsWith('/admin/executive')) return false;
  if (href === '/inventory' && pathname.startsWith('/inventory/floor')) return false;
  if (href === '/inventory/floor' && pathname.startsWith('/inventory/floor')) return true;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function syncMobileNavHeightCssVar(navEl: HTMLElement | null) {
  if (typeof document === 'undefined') return;
  if (!navEl) {
    document.documentElement.style.removeProperty('--freshloop-mobile-nav-h');
    return;
  }
  const style = window.getComputedStyle(navEl);
  const rect = navEl.getBoundingClientRect();
  if (style.display === 'none' || rect.height < 1) {
    document.documentElement.style.removeProperty('--freshloop-mobile-nav-h');
    return;
  }
  const h = Math.ceil(rect.height);
  document.documentElement.style.setProperty('--freshloop-mobile-nav-h', `${h}px`);
}

export function Navigation({ onVoice }: { onVoice?: () => void } = {}) {
  const pathname = usePathname();
  const { activeUser, signOutUser } = useRole();
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const mobileNavRef = useRef<HTMLElement | null>(null);
  const role = activeUser?.role ?? null;
  const items = navItemsForRole(role).map((item) => withIcon(item, role));
  const phoneNav = splitPhoneNav(visiblePhoneNavItems(items, Boolean(onVoice)));
  const moreActive = phoneNav.more.some((item) => (item.href ? isActive(pathname, item.href) : false));

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useLayoutEffect(() => {
    const el = mobileNavRef.current;
    if (!el) return;

    const run = () => syncMobileNavHeightCssVar(el);
    run();

    const ro = new ResizeObserver(run);
    ro.observe(el);

    window.addEventListener('orientationchange', run);
    const mq = window.matchMedia('(max-width: 767px)');
    const onMq = () => run();
    mq.addEventListener('change', onMq);

    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', run);
      mq.removeEventListener('change', onMq);
      document.documentElement.style.removeProperty('--freshloop-mobile-nav-h');
    };
  }, [items.length, pathname]);

  return (
    <>
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-slate-800 bg-slate-950 md:flex ${
          collapsed ? 'w-[72px]' : 'w-56'
        }`}
      >
        <div className={`flex items-center gap-2 px-3 py-4 ${collapsed ? 'justify-center' : ''}`}>
          <Link href={brandHref(role)} prefetch={false} className="flex items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-900/50 text-blue-200 ring-1 ring-blue-800/60">
              <Leaf className="h-5 w-5" />
            </span>
            {collapsed ? null : <span className="text-base font-black text-slate-100">FreshLoop</span>}
          </Link>
        </div>
        <nav className="flex-1 space-y-1 px-2">
          {items.map((item) => (
              <NavRow
                key={item.id}
                item={item}
                active={item.href ? isActive(pathname, item.href) : false}
                collapsed={collapsed}
                onVoice={onVoice}
              />
            ))}
        </nav>
        <div className="space-y-2 border-t border-slate-800 p-2">
          {collapsed ? null : activeUser ? (
            <div className="px-1">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Signed in
              </p>
              <p className="mt-1 truncate text-xs font-bold text-slate-100">{activeUser.name}</p>
              <p className="truncate text-xs text-slate-500">
                {ROLE_LABELS[activeUser.role]}
              </p>
              <button
                type="button"
                onClick={() => void signOutUser()}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900/60 px-2 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800"
              >
                Sign out
              </button>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setCollapsed((current) => !current)}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-2 py-2 text-xs font-bold text-slate-400 hover:bg-slate-800/50"
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            <PanelLeft className="h-4 w-4" />
            {collapsed ? null : 'Collapse'}
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/95 px-3 py-3 backdrop-blur-xl md:hidden">
        <Link href={brandHref(role)} prefetch={false} className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-900/50 text-blue-200 ring-1 ring-blue-800/60">
            <Leaf className="h-4 w-4" />
          </span>
          <span className="text-sm font-black text-slate-100">FreshLoop</span>
        </Link>
        {activeUser ? (
          <button
            type="button"
            onClick={() => void signOutUser()}
            className="max-w-[11rem] truncate rounded-lg border border-slate-700 bg-slate-900/60 px-2 py-2 text-xs font-bold text-slate-100"
            title={`${activeUser.name} · ${ROLE_LABELS[activeUser.role]}`}
          >
            {activeUser.name}
          </button>
        ) : null}
      </header>

      {moreOpen && phoneNav.more.length > 0 ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/70"
            aria-label="Close more navigation"
            onClick={() => setMoreOpen(false)}
          />
          <div
            role="dialog"
            aria-label="More"
            className="absolute inset-x-0 bottom-[var(--freshloop-mobile-nav-h,4.5rem)] rounded-t-2xl border border-slate-700 bg-slate-900 p-3 shadow-2xl"
          >
            <ul className="space-y-1">
              {phoneNav.more.map((shown) => (
                <li key={shown.id}>
                  <PhoneNavLink
                    item={shown}
                    active={shown.href ? isActive(pathname, shown.href) : false}
                    onVoice={onVoice}
                    layout="row"
                    onNavigate={() => setMoreOpen(false)}
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <nav
        ref={mobileNavRef}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800 bg-slate-950/95 px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-xl md:hidden"
        aria-label="Primary"
      >
        <ul
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${phoneNav.bar.length + (phoneNav.more.length > 0 ? 1 : 0)}, minmax(0, 1fr))`,
          }}
        >
          {phoneNav.bar.map((shown) => (
            <li key={shown.id} className="min-w-0">
              <PhoneNavLink
                item={shown}
                active={shown.href ? isActive(pathname, shown.href) : false}
                onVoice={onVoice}
              />
            </li>
          ))}
          {phoneNav.more.length > 0 ? (
            <li className="min-w-0">
              <button
                type="button"
                aria-expanded={moreOpen}
                aria-pressed={moreActive}
                onClick={() => setMoreOpen((open) => !open)}
                className={`flex min-h-11 w-full flex-col items-center justify-center gap-0.5 px-1 py-1 text-xs font-bold ${
                  moreOpen || moreActive ? 'text-blue-300' : 'text-slate-400'
                }`}
              >
                <Ellipsis className="h-5 w-5" />
                <span className="max-w-full truncate">More</span>
              </button>
            </li>
          ) : null}
        </ul>
      </nav>
    </>
  );
}

function PhoneNavLink({
  item,
  active,
  onVoice,
  layout = 'stack',
  onNavigate,
}: {
  item: ShownNavItem;
  active: boolean;
  onVoice?: () => void;
  layout?: 'stack' | 'row';
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const className =
    layout === 'row'
      ? `flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-bold ${
          active ? 'bg-blue-900/40 text-slate-100' : 'text-slate-200'
        }`
      : `flex min-h-11 w-full flex-col items-center justify-center gap-0.5 px-1 py-1 text-xs font-bold ${
          active ? 'text-blue-300' : 'text-slate-400'
        }`;
  if (item.voice) {
    if (!onVoice) return null;
    return (
      <button
        type="button"
        onClick={() => {
          onVoice();
          onNavigate?.();
        }}
        className={className}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span className="max-w-full truncate">Voice</span>
      </button>
    );
  }
  return (
    <Link
      href={item.href ?? '/admin'}
      prefetch={false}
      className={className}
      title={item.label}
      onClick={onNavigate}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="max-w-full truncate">{item.label}</span>
    </Link>
  );
}

function NavRow({
  item,
  active,
  collapsed,
  onVoice,
}: {
  item: ShownNavItem;
  active: boolean;
  collapsed: boolean;
  onVoice?: () => void;
}) {
  const Icon = item.icon;
  const className = `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
    collapsed ? 'justify-center' : ''
  } ${
    active
      ? 'bg-blue-900/40 text-slate-100 ring-1 ring-blue-800/70'
      : 'text-slate-300 hover:bg-slate-800/50 hover:text-slate-100'
  }`;
  if (item.voice) {
    if (!onVoice) return null;
    return (
      <button type="button" onClick={onVoice} className={className} title="Voice">
        <Icon className="h-4 w-4 shrink-0" />
        {collapsed ? null : 'Voice'}
      </button>
    );
  }
  return (
    <Link href={item.href ?? '/admin'} prefetch={false} className={className} title={item.label}>
      <Icon className="h-4 w-4 shrink-0" />
      {collapsed ? null : item.label}
    </Link>
  );
}

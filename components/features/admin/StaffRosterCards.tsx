'use client';

import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { departmentLabel, houseForRole } from '@/lib/utils/positions';
import { formatHourlyRate } from '@/lib/utils/hourlyRateDisplay';
import { ROLE_LABELS, type RoleName, type StaffUser } from '@/lib/utils/roles';
import { cn } from '@/lib/utils/cn';

function roleBadgeVariant(role: RoleName): BadgeVariant {
  if (role === 'ADMIN') return 'success';
  if (role === 'STORE_MANAGER') return 'ocean';
  if (role === 'DELI_CHEF') return 'warning';
  return 'neutral';
}

export function StaffRosterSkeleton() {
  return (
    <div className="mt-4 space-y-3" aria-busy="true" aria-label="Loading staff">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="animate-pulse rounded-2xl border border-slate-800 bg-slate-950/40 p-4"
        >
          <div className="h-4 w-36 max-w-full rounded bg-slate-800" />
          <div className="mt-2 h-3 w-52 max-w-full rounded bg-slate-800/80" />
          <div className="mt-3 h-3 w-40 max-w-full rounded bg-slate-800/70" />
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="h-5 w-16 rounded-full bg-slate-800" />
            <div className="h-4 w-16 shrink-0 rounded bg-slate-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function StaffRosterCards({
  users,
  activeUserId,
  onOpen,
}: {
  users: StaffUser[];
  activeUserId?: string;
  onOpen: (user: StaffUser) => void;
}) {
  if (users.length === 0) {
    return (
      <p className="mt-4 rounded-2xl border border-dashed border-slate-800 px-4 py-10 text-center text-sm text-slate-500">
        No staff listed yet. Add your first employee above.
      </p>
    );
  }

  return (
    <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
      {users.map((user) => {
        const inactive = Boolean(user.deactivatedAt);
        const house = houseForRole(user.role);
        const department = departmentLabel(user.position, user.role);
        return (
          <li key={user.id} className="min-w-0">
            <button
              type="button"
              onClick={() => onOpen(user)}
              aria-label={`Open ${user.name}`}
              className={cn(
                'flex w-full min-w-0 flex-col gap-2 rounded-2xl border p-4 text-left transition',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70',
                inactive
                  ? 'border-dashed border-slate-700 bg-slate-950/20 hover:border-slate-600'
                  : 'border-slate-800/90 bg-slate-950/50 hover:border-emerald-500/40 hover:bg-slate-900/70',
                user.id === activeUserId && !inactive && 'border-emerald-500/40 bg-emerald-500/5'
              )}
            >
              <p className="break-words text-base font-bold leading-snug text-white">{user.name}</p>
              <p className="break-all text-sm text-slate-400">{user.email}</p>
              <p className="text-sm text-slate-300">
                <span className="font-semibold text-slate-100">{house}</span>
                <span className="text-slate-600"> · </span>
                <span className="break-words">{department}</span>
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant={roleBadgeVariant(user.role)}>{ROLE_LABELS[user.role]}</Badge>
                  {inactive ? <Badge variant="destructive">Inactive</Badge> : null}
                </span>
                <span className="shrink-0 whitespace-nowrap font-mono text-sm font-semibold tabular-nums text-slate-100">
                  {formatHourlyRate(user.hourlyRate)}
                </span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

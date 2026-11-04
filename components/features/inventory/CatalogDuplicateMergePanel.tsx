'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRightLeft, Loader2, RefreshCw } from 'lucide-react';

type DuplicateGroup = {
  primaryId: string;
  primaryName: string;
  matchScore: number;
  members: Array<{ id: string; name: string; onHand: number }>;
};

export function CatalogDuplicateMergePanel({ onMerged }: { onMerged?: () => void }) {
  const [groups, setGroups] = useState<DuplicateGroup[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [mergingId, setMergingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/catalog/duplicates', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Could not load duplicate groups.');
      }
      setGroups(Array.isArray(json.groups) ? json.groups : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load duplicates.');
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const combineGroup = async (group: DuplicateGroup) => {
    const mergeProductIds = group.members.filter((m) => m.id !== group.primaryId).map((m) => m.id);
    const stockToMove = group.members
      .filter((m) => m.id !== group.primaryId)
      .reduce((sum, m) => sum + Math.max(0, m.onHand), 0);
    if (
      !window.confirm(
        `Add ${stockToMove > 0 ? `${stockToMove.toFixed(2)} units of ` : ''}inventory from ${mergeProductIds.length} duplicate SKU(s) onto "${group.primaryName}"?\n\nDuplicate rows will be hidden from the catalog. Past invoice history stays on each SKU.`
      )
    ) {
      return;
    }
    setMergingId(group.primaryId);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/catalog/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryId: group.primaryId, mergeProductIds }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || json.message || 'Could not combine stock.');
      }
      const moved = Number(json.unitsMoved ?? 0);
      setMessage(
        moved > 0
          ? `Added ${moved.toFixed(2)} units to "${group.primaryName}" and hid duplicate SKUs.`
          : `Duplicate SKUs hidden; "${group.primaryName}" is now the catalog row.`
      );
      await load();
      onMerged?.();
      window.dispatchEvent(new CustomEvent('freshloop-inventory-updated'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not combine stock.');
    } finally {
      setMergingId(null);
    }
  };

  if (groups !== null && groups.length === 0 && !loading && !error) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-300/90">
            Duplicate SKU cleanup
          </p>
          <p className="mt-1 text-sm text-slate-300">
            Same item, different invoice names. Quickly add on-hand units to the primary SKU and hide the
            extras—no slow full ledger rewrite.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error ? <p className="mt-3 text-xs text-rose-300">{error}</p> : null}
      {message ? <p className="mt-3 text-xs text-emerald-300">{message}</p> : null}

      {loading && groups === null ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Scanning catalog…
        </p>
      ) : null}

      {groups && groups.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {groups.map((group) => {
            const duplicates = group.members.filter((m) => m.id !== group.primaryId);
            return (
              <li
                key={group.primaryId}
                className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-white">{group.primaryName}</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Keep · match {group.matchScore}% · {group.members.length} SKUs
                    </p>
                    <ul className="mt-2 space-y-1 text-xs text-slate-400">
                      {duplicates.map((m) => (
                        <li key={m.id} className="truncate">
                          → add stock from <span className="text-slate-300">{m.name}</span>
                          {m.onHand !== 0 ? (
                            <span className="text-amber-300/90"> · {m.onHand} on hand</span>
                          ) : (
                            <span className="text-slate-500"> · 0 on hand (hide only)</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button
                    type="button"
                    disabled={mergingId === group.primaryId}
                    onClick={() => void combineGroup(group)}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-500/90 px-4 py-2.5 text-xs font-extrabold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                  >
                    {mergingId === group.primaryId ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRightLeft className="h-4 w-4" />
                    )}
                    Add stock to primary
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

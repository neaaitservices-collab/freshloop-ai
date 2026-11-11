'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, ChevronDown, Search, Sparkles } from 'lucide-react';
import { useRole } from '@/components/auth/RoleProvider';
import { InventoryMasterDetail } from '@/components/features/inventory/InventoryMasterDetail';
import { SubInventoryWorkspace } from '@/components/features/inventory/SubInventoryWorkspace';
import { useStorePullSensitivityDays } from '@/hooks/use-store-pull-sensitivity-days';
import { Card, CardBody } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import { Toast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { CATALOG_DEPARTMENTS, departmentLabel, matchesStoredDepartment } from '@/lib/domains/inventory/inventoryCatalog';
import type { StockLevel } from '@/lib/domains/inventory/stock';
import { useOptimisticInventoryLevels } from '@/hooks/use-optimistic-inventory-levels';
import { formatCurrency } from '@/lib/domains/receiving/yieldPricing';

export function SlateInventory({
  levels: initialLevels,
  highlightProductId,
}: {
  levels: StockLevel[] | null;
  highlightProductId?: string | null;
}) {
  const loading = initialLevels === null;
  const router = useRouter();
  const { levels, setLevels, performMove, patchLevelOptimistic } =
    useOptimisticInventoryLevels(initialLevels);
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState<string>('ALL');
  const pullDays = useStorePullSensitivityDays();
  const [toast, setToast] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [levelsSyncWarning, setLevelsSyncWarning] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { activeUser } = useRole();

  useEffect(() => {
    const syncFromServer = () => {
      void fetch(
        `/api/inventory/levels?includePosSales=1&salesDays=${encodeURIComponent(String(pullDays))}`,
        { cache: 'no-store' }
      )
        .then(async (response) => {
          const json = (await response.json()) as {
            success?: boolean;
            levels?: StockLevel[];
            error?: string;
          };
          if (!response.ok || !json.success) {
            setLevelsSyncWarning(json.error ?? 'Could not sync inventory.');
            return;
          }
          if (Array.isArray(json.levels)) {
            setLevelsSyncWarning(null);
            setLevels(json.levels);
          }
        })
        .catch((err: unknown) => {
          setLevelsSyncWarning('Network error — list may be out of date.');
          console.error('[freshloop] SlateInventory syncFromServer', err);
        });
    };
    window.addEventListener('freshloop-inventory-updated', syncFromServer);
    return () => window.removeEventListener('freshloop-inventory-updated', syncFromServer);
  }, [setLevels, pullDays]);

  const departmentFilter = useCallback(
    (row: StockLevel) => matchesStoredDepartment(row.department, department),
    [department]
  );

  const onHand = useMemo(() => levels.filter((row) => row.onHand > 0), [levels]);

  const flaggedForMetrics = useMemo(
    () => onHand.filter((row) => row.daysRemaining <= row.pullDays || row.low || row.isMarkdown),
    [onHand]
  );

  const totalValueAtRisk = flaggedForMetrics.reduce(
    (sum, row) => sum + row.onHand * row.unitCost,
    0
  );
  const lowCount = onHand.filter((row) => row.low).length;
  const markdownCount = onHand.filter((row) => row.isMarkdown).length;
  const kitchenRoutedCount = levels.filter((row) => row.kitchenPrepQty > 0).length;

  return (
    <section className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-300/80">
            Slate &amp; Ocean Steel
          </p>
          <h1 className="text-xl font-black tracking-tight text-slate-100 sm:text-2xl">
            Inventory &amp; floor management
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-slate-400 sm:text-sm">
            Master-detail editing for yield and shelf price. Floor moves on the selected row.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" className="h-10 px-3 text-xs" onClick={() => router.push('/operations')}>
            <ArrowRight className="h-4 w-4 rotate-180" />
            Ledger
          </Button>
          <Button variant="success" className="h-10 px-3 text-xs" onClick={() => router.push('/production')}>
            <Sparkles className="h-4 w-4" />
            Recipes
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4">
        {[
          {
            label: 'Value at risk',
            value: formatCurrency(totalValueAtRisk),
            sub: `${flaggedForMetrics.length} flagged`,
            accent: 'text-amber-400/90',
          },
          {
            label: 'Production prep',
            value: `${kitchenRoutedCount}`,
            sub: 'SKUs with prep balance',
            accent: 'text-emerald-400/90',
          },
          {
            label: 'Markdown floor',
            value: `${markdownCount}`,
            sub: 'Discount labels active',
            accent: 'text-amber-400',
          },
          {
            label: 'Low stock',
            value: `${lowCount}`,
            sub: 'Below par',
            accent: 'text-slate-200',
          },
        ].map((metric) => (
          <Card key={metric.label}>
            <CardBody className="py-3.5 sm:py-4">
              <span className="block truncate text-[10px] font-semibold text-slate-400 sm:text-xs">
                {metric.label}
              </span>
              <span className={`mt-1 block text-lg font-extrabold sm:text-2xl ${metric.accent}`}>
                {metric.value}
              </span>
              <span className="mt-0.5 block text-[10px] text-slate-500">{metric.sub}</span>
            </CardBody>
          </Card>
        ))}
      </div>

      {levelsSyncWarning ? (
        <p className="rounded-xl border border-amber-900/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
          {levelsSyncWarning}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Select
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="w-full sm:w-44 text-xs"
        >
          <option value="ALL">All departments</option>
          {CATALOG_DEPARTMENTS.map((dept) => (
            <option key={dept} value={dept}>
              {departmentLabel(dept)}
            </option>
          ))}
        </Select>
        <label className="relative block w-full sm:w-48">
          <span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search item…"
            className="py-2 pl-9 text-xs"
          />
        </label>
      </div>

      {loading ? (
        <Card>
          <CardBody className="space-y-2 py-8">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-xl bg-slate-800/80" />
            ))}
          </CardBody>
        </Card>
      ) : (
        <InventoryMasterDetail
          levels={levels}
          highlightProductId={highlightProductId}
          onLevelsChange={setLevels}
          patchLevelOptimistic={patchLevelOptimistic}
          performMove={performMove}
          query={query}
          departmentFilter={departmentFilter}
          onToast={(message) => {
            setErrorMessage(null);
            setToast(message);
            router.refresh();
          }}
          onError={(message) => {
            setErrorMessage(message || null);
          }}
        />
      )}

      <Card className="overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-bold text-slate-200 hover:bg-slate-800/40"
        >
          Split view: retail floor &amp; production prep
          <ChevronDown
            className={`h-4 w-4 text-slate-400 transition ${showAdvanced ? 'rotate-180' : ''}`}
          />
        </button>
        {showAdvanced ? (
          <CardBody className="border-t border-slate-800/80 pt-4">
            <SubInventoryWorkspace
              levels={levels}
              loading={loading}
              pullDays={pullDays}
              staffId={activeUser?.id}
              query={query}
              departmentFilter={departmentFilter}
              retailPriorityOnly={false}
              showRetailCatalog
              performMove={performMove}
              onSuccess={(message, level) => {
                setLevels((current) =>
                  current.map((item) => (item.productId === level.productId ? level : item))
                );
                setToast(message);
                router.refresh();
              }}
              onError={(message) => setErrorMessage(message)}
            />
          </CardBody>
        ) : null}
      </Card>

      {lowCount > 0 ? (
        <p className="text-center text-xs text-slate-400">
          Restock from{' '}
          <Link href="/orders" className="font-bold text-blue-300 underline-offset-2 hover:underline">
            purchase orders
          </Link>
          .
        </p>
      ) : null}

      {errorMessage ? (
        <p className="rounded-xl border border-rose-900/50 bg-rose-950/30 px-3 py-2 text-sm font-semibold text-rose-400">
          {errorMessage}
        </p>
      ) : null}

      <Toast message={toast} onDismiss={() => setToast(null)} variant="success" />
    </section>
  );
}

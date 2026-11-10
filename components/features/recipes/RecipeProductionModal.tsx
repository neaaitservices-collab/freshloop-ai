'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useRole } from '@/components/auth/RoleProvider';
import { notifyInventoryUpdated } from '@/lib/domains/inventory/inventoryMoveClient';
import { resolveManufacturingRecipeId } from '@/lib/domains/manufacturing/fallbackRecipes';
import type {
  KitchenRecipeDefinition,
  ProductionBatchExecutedSummary,
} from '@/lib/domains/manufacturing/types';
import type { RoleName } from '@/lib/utils/roles';
import { batchActionLabel } from '@/lib/domains/manufacturing/batchActionLabel';
import { computeScaledBatchCost } from '@/lib/domains/manufacturing/batchCost';
import { manufacturingPayloadKey } from '@/lib/domains/manufacturing/manufacturingPayload';
import {
  browserManufacturingOperationStore,
  claimManufacturingOperationId,
  manufacturingOperationStorageKey,
  purgeUnscopedManufacturingOperationKeys,
  settleManufacturingOperationId,
} from '@/lib/domains/manufacturing/operationAttempt';
import { resolveLaborRatePerHour } from '@/lib/domains/manufacturing/resolveLaborRate';
import { ModalBody, ModalFooter, ModalHeader, ModalShell, ScrollTable } from '@/components/ui/layout';
import {
  ChefHat,
  X,
  Loader2,
  AlertTriangle,
  Sliders,
  PackageCheck,
  Sparkles,
} from 'lucide-react';

export type {
  KitchenRecipeBOMIngredient,
  KitchenRecipeDefinition,
  ProductionBatchExecutedSummary,
} from '@/lib/domains/manufacturing/types';

function manufacturingRoleForApi(role: RoleName | undefined): string {
  if (!role) return 'KITCHEN_STAFF';
  if (role === 'DELI_CHEF') return 'DELI_CHEF';
  if (role === 'ADMIN' || role === 'STORE_MANAGER') return role;
  return 'KITCHEN_STAFF';
}

interface RecipeProductionModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRecipeId?: string;
  onBatchProduced?: (summary: ProductionBatchExecutedSummary) => void;
  onBatchFailed?: (message: string) => void;
}

const KITCHEN_RECIPES_CATALOG: KitchenRecipeDefinition[] = [
  {
    recipeId: 'rec-panzanella-001',
    recipeName: 'Roasted Hot House Tomato & Sourdough Panzanella',
    category: 'Salad / Panzanella',
    outputProductId: 'prod-deli-panzanella',
    outputProductName: 'Roasted Tomato & Sourdough Panzanella (12 oz)',
    standardBatchYield: 20,
    outputUnit: 'TUB',
    targetRetailPrice: 8.99,
    prepTimeMinutes: 25,
    laborHours: 0.75,
    laborRatePerHour: 17.6,
    packagingCostPerUnit: 1,
    bom: [
      {
        ingredientProductId: 'prod-tomato-hothouse',
        name: 'Hot House Tomatoes (Ontario)',
        standardQtyPerBatch: 15,
        unit: 'LBS / KG',
        movingAvgUnitCost: 2.5,
        allowVariance: true,
        availableKitchenStock: 15,
      },
      {
        ingredientProductId: 'prod-sourdough-boule',
        name: 'Artisanal Sourdough Boule',
        standardQtyPerBatch: 8,
        unit: 'LOAF',
        movingAvgUnitCost: 2.1,
        allowVariance: true,
        availableKitchenStock: 8,
      },
      {
        ingredientProductId: 'prod-evoo-5l',
        name: 'Extra Virgin Olive Oil (Bulk Kitchen)',
        standardQtyPerBatch: 0.5,
        unit: 'LITER',
        movingAvgUnitCost: 5.7,
        allowVariance: false,
        availableKitchenStock: 19.5,
      },
    ],
  },
  {
    recipeId: 'rec-guacamole-003',
    recipeName: 'Avocado & Ontario Tomato Guacamole Cups',
    category: 'Prepared Grab-n-Go',
    outputProductId: 'prod-deli-guacamole',
    outputProductName: 'Fresh Kitchen Rescue Guacamole Cup (6 oz)',
    standardBatchYield: 30,
    outputUnit: 'TUB',
    targetRetailPrice: 4.99,
    prepTimeMinutes: 20,
    laborHours: 0.5,
    laborRatePerHour: 17.6,
    packagingCostPerUnit: 0.85,
    bom: [
      {
        ingredientProductId: 'prod-avocado-hass',
        name: 'Avocados Hass (Mexico)',
        standardQtyPerBatch: 18,
        unit: 'UNIT / KG',
        movingAvgUnitCost: 1.81,
        allowVariance: true,
        availableKitchenStock: 36,
      },
      {
        ingredientProductId: 'prod-tomato-cocktail',
        name: 'Cocktail Tomatoes',
        standardQtyPerBatch: 2,
        unit: 'LBS / KG',
        movingAvgUnitCost: 3.5,
        allowVariance: true,
        availableKitchenStock: 4,
      },
      {
        ingredientProductId: 'prod-cilantro',
        name: 'Fresh Cilantro Bunch',
        standardQtyPerBatch: 6,
        unit: 'BUNCH',
        movingAvgUnitCost: 1.38,
        allowVariance: true,
        availableKitchenStock: 6,
      },
      {
        ingredientProductId: 'prod-jalapeno',
        name: 'Jalapeno Peppers',
        standardQtyPerBatch: 4,
        unit: 'LBS / KG',
        movingAvgUnitCost: 1.9,
        allowVariance: true,
        availableKitchenStock: 4,
      },
    ],
  },
  {
    recipeId: 'rec-parfait-002',
    recipeName: 'Honeycrisp & Spiced Cream Bakery Parfait',
    category: 'Parfait / Dessert',
    outputProductId: 'prod-deli-parfait',
    outputProductName: 'Honeycrisp & Spiced Cream Parfait (10 oz)',
    standardBatchYield: 28,
    outputUnit: 'TUB',
    targetRetailPrice: 6.49,
    prepTimeMinutes: 30,
    laborHours: 1,
    laborRatePerHour: 17.6,
    packagingCostPerUnit: 1.1,
    bom: [
      {
        ingredientProductId: 'prod-apple-honeycrisp',
        name: 'Honey Crisp Apples',
        standardQtyPerBatch: 20,
        unit: 'LBS / KG',
        movingAvgUnitCost: 2.62,
        allowVariance: true,
        availableKitchenStock: 20,
      },
      {
        ingredientProductId: 'prod-heavy-cream',
        name: 'Whole Heavy Cream 40%',
        standardQtyPerBatch: 6,
        unit: 'LITER',
        movingAvgUnitCost: 3.8,
        allowVariance: true,
        availableKitchenStock: 6,
      },
      {
        ingredientProductId: 'prod-greek-yogurt',
        name: 'Greek Whole Milk Yogurt (750g)',
        standardQtyPerBatch: 8,
        unit: 'TUB',
        movingAvgUnitCost: 2.2,
        allowVariance: false,
        availableKitchenStock: 24,
      },
    ],
  },
];

export const RecipeProductionModal: React.FC<RecipeProductionModalProps> = ({
  isOpen,
  onClose,
  initialRecipeId,
  onBatchProduced,
  onBatchFailed,
}) => {
  const { activeUser, loading: sessionLoading } = useRole();
  const staffRole = manufacturingRoleForApi(activeUser?.role);
  const [catalog, setCatalog] = useState<KitchenRecipeDefinition[]>(
    KITCHEN_RECIPES_CATALOG
  );
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>(
    KITCHEN_RECIPES_CATALOG[0].recipeId
  );
  const [batchOutputQty, setBatchOutputQty] = useState<number>(
    KITCHEN_RECIPES_CATALOG[0].standardBatchYield
  );
  const [varianceEnabled, setVarianceEnabled] = useState<boolean>(false);
  const [customWeights, setCustomWeights] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [completedBatch, setCompletedBatch] =
    useState<ProductionBatchExecutedSummary | null>(null);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const res = await fetch('/api/manufacturing', { cache: 'no-store' });
      const json = await res.json();
      if (json.success && Array.isArray(json.recipes) && json.recipes.length > 0) {
        setCatalog(json.recipes as KitchenRecipeDefinition[]);
      }
    } catch {
      /* keep seeded fallback */
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setCompletedBatch(null);
    setErrorMsg(null);
    void loadCatalog();
  }, [isOpen, loadCatalog]);

  useEffect(() => {
    if (!isOpen || catalog.length === 0) return;
    const resolved = initialRecipeId
      ? resolveManufacturingRecipeId(initialRecipeId)
      : catalog[0].recipeId;
    const found =
      catalog.find((r) => r.recipeId === resolved) ??
      catalog.find((r) => r.recipeId === initialRecipeId) ??
      catalog[0];
    setSelectedRecipeId(found.recipeId);
    setBatchOutputQty(found.standardBatchYield);
    setCustomWeights({});
  }, [isOpen, initialRecipeId, catalog]);

  const selectedRecipe = useMemo(
    () =>
      catalog.find((r) => r.recipeId === selectedRecipeId) || catalog[0],
    [catalog, selectedRecipeId]
  );

  const scaleRatio =
    selectedRecipe.standardBatchYield > 0
      ? batchOutputQty / selectedRecipe.standardBatchYield
      : 1;

  // Dynamic BOM breakdown & real-time Moving Average Cost batch calculation
  const computedBomRows = useMemo(() => {
    return selectedRecipe.bom.map((ing) => {
      const scaledStandardQty = Number(
        (ing.standardQtyPerBatch * scaleRatio).toFixed(2)
      );
      const customVal = customWeights[ing.ingredientProductId];
      const actualQty =
        varianceEnabled && ing.allowVariance && customVal !== undefined
          ? customVal
          : scaledStandardQty;
      const varianceDelta = Number((actualQty - scaledStandardQty).toFixed(2));
      const lineCost = Number(
        (actualQty * ing.movingAvgUnitCost).toFixed(2)
      );

      return {
        ...ing,
        scaledStandardQty,
        actualQty,
        varianceDelta,
        lineCost,
      };
    });
  }, [selectedRecipe, scaleRatio, varianceEnabled, customWeights]);

  const laborRatePerHour = useMemo(
    () =>
      resolveLaborRatePerHour({
        staffHourlyRate: activeUser?.hourlyRate ?? null,
        recipeLaborRate: selectedRecipe.laborRatePerHour ?? null,
      }),
    [activeUser?.hourlyRate, selectedRecipe.laborRatePerHour]
  );

  const totalBatchCost = useMemo(() => {
    const ingredientCost = computedBomRows.reduce((sum, r) => sum + r.lineCost, 0);
    if (!selectedRecipe) return ingredientCost;
    const breakdown = computeScaledBatchCost({
      ingredientCost,
      laborHours: selectedRecipe.laborHours ?? 0,
      laborRatePerHour,
      packagingCostPerUnit: selectedRecipe.packagingCostPerUnit ?? 0,
      standardYield: selectedRecipe.standardBatchYield,
      actualBatchOutput: batchOutputQty,
    });
    return breakdown.totalBatchCost;
  }, [
    computedBomRows,
    selectedRecipe,
    batchOutputQty,
    laborRatePerHour,
  ]);

  const unitOutputCost = useMemo(
    () =>
      batchOutputQty > 0
        ? Number((totalBatchCost / batchOutputQty).toFixed(2))
        : 0,
    [totalBatchCost, batchOutputQty]
  );

  const projectedMarginPct = useMemo(() => {
    if (selectedRecipe.targetRetailPrice <= 0) return 0;
    return Number(
      (
        ((selectedRecipe.targetRetailPrice - unitOutputCost) /
          selectedRecipe.targetRetailPrice) *
        100
      ).toFixed(1)
    );
  }, [selectedRecipe.targetRetailPrice, unitOutputCost]);

  if (!selectedRecipe) {
    return (
      <ModalShell open={isOpen} onClose={onClose} width="sm">
        <ModalBody>
          <p className="text-sm text-slate-300">No BOM recipes are available.</p>
        </ModalBody>
      </ModalShell>
    );
  }

  const handleRecipeChange = (newRecipeId: string) => {
    const found = catalog.find((r) => r.recipeId === newRecipeId);
    setSelectedRecipeId(newRecipeId);
    if (found) {
      setBatchOutputQty(found.standardBatchYield);
    }
    setCustomWeights({});
    setCompletedBatch(null);
    setErrorMsg(null);
  };

  const handleExecuteProduction = async () => {
    if (!selectedRecipe || submitting) return;
    const staffId = activeUser?.id?.trim() ?? '';
    if (sessionLoading || !staffId) {
      const msg = sessionLoading
        ? 'Wait for your sign-in to finish, then run the batch again.'
        : 'Sign in again before running this batch.';
      setErrorMsg(msg);
      onBatchFailed?.(msg);
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);

    const ingredientOverrides = varianceEnabled
      ? computedBomRows
          .filter((r) => r.allowVariance)
          .map((r) => ({
            ingredient_product_id: r.ingredientProductId,
            actual_qty_used: r.actualQty,
          }))
      : undefined;

    const requestBody = {
      recipe_id: selectedRecipe.recipeId,
      batch_output: batchOutputQty,
      enforce_stock_check: true as const,
      ingredient_overrides: ingredientOverrides,
    };
    const payloadKey = manufacturingPayloadKey(requestBody);
    const operationStore = browserManufacturingOperationStore();
    purgeUnscopedManufacturingOperationKeys(operationStore.keys(), (key) =>
      operationStore.delete(key)
    );
    const storageKey = manufacturingOperationStorageKey(staffId, payloadKey);
    if (!storageKey) {
      const msg = 'Sign in again before running this batch.';
      setErrorMsg(msg);
      onBatchFailed?.(msg);
      setSubmitting(false);
      return;
    }
    const operationId = claimManufacturingOperationId(operationStore, storageKey, () =>
      crypto.randomUUID()
    );

    try {
      const res = await fetch('/api/manufacturing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation_id: operationId,
          ...requestBody,
        }),
      });

      const json = await res.json();

      if (json.code === 'MANUFACTURING_OPERATION_CONFLICT') {
        settleManufacturingOperationId(operationStore, storageKey);
      }

      if (res.status === 403) {
        const msg =
          json.error ||
          json.message ||
          'Access denied: only production staff can run a BOM batch.';
        setErrorMsg(msg);
        onBatchFailed?.(msg);
        return;
      }

      if (!res.ok || json.success === false) {
        const msg = json.error || json.message || 'The batch failed on the server.';
        setErrorMsg(msg);
        onBatchFailed?.(msg);
        return;
      }

      const summary: ProductionBatchExecutedSummary = {
        recipeId: selectedRecipe.recipeId,
        recipeName: selectedRecipe.recipeName,
        outputProductId: selectedRecipe.outputProductId,
        outputProductName: selectedRecipe.outputProductName,
        batchOutputQty,
        totalBatchCost,
        unitOutputCost,
        ingredientsUsed: computedBomRows.map((r) => ({
          ingredientProductId: r.ingredientProductId,
          name: r.name,
          actualQtyUsed: r.actualQty,
          unit: r.unit,
        })),
      };

      settleManufacturingOperationId(operationStore, storageKey);
      onBatchProduced?.(summary);
      notifyInventoryUpdated();
      window.dispatchEvent(new CustomEvent('freshloop-kitchen-inbox'));
      onClose();
    } catch {
      const msg =
        'Could not reach the server. Check the connection and try again.';
      setErrorMsg(msg);
      onBatchFailed?.(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      open={isOpen}
      onClose={onClose}
      width="lg"
      panelClassName="max-w-3xl rounded-3xl border-slate-800 bg-slate-900"
    >
        <ModalHeader className="border-slate-800 bg-slate-950/75 px-5 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-400">
              <ChefHat className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base sm:text-lg text-white">
                  Production manufacturing and BOM
                </h3>
                <span className="text-xs font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-500/30">
                  RBAC: Production only
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {activeUser?.name ?? 'Staff'} · {staffRole} — deducts{' '}
                <code className="text-amber-300">Production prep</code> and posts the
                finished item to the ledger
                {catalogLoading ? ' · updating stock…' : ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 cursor-pointer rounded-xl p-2 text-zinc-400 transition-all hover:bg-zinc-800 hover:text-white"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        </ModalHeader>

        <ModalBody className="space-y-5 p-5 text-xs text-zinc-200 sm:p-6">
          {errorMsg && (
            <div className="p-4 rounded-2xl bg-rose-950/80 border border-rose-500/50 text-rose-200 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <div>
                <p className="font-bold text-rose-300">RBAC safeguard</p>
                <p>{errorMsg}</p>
              </div>
            </div>
          )}

          {!completedBatch ? (
            <>
              {/* Recipe Selector + Batch Output + RBAC Role Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                <div className="sm:col-span-6">
                  <label className="font-bold text-zinc-400 uppercase text-xs tracking-wider block mb-1.5">
                    Rescue recipe (BOM)
                  </label>
                  <select
                    value={selectedRecipeId}
                    onChange={(e) => handleRecipeChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-bold text-white focus:outline-none focus:border-amber-500/60"
                  >
                    {catalog.map((rec) => (
                      <option key={rec.recipeId} value={rec.recipeId}>
                        {rec.recipeName} ({rec.standardBatchYield} {rec.outputUnit})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-6">
                  <label className="font-bold text-zinc-400 uppercase text-xs tracking-wider block mb-1.5">
                    Portions produced
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={batchOutputQty}
                    onChange={(e) =>
                      setBatchOutputQty(Math.max(1, Number(e.target.value) || 1))
                    }
                    className="min-h-12 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs font-mono font-bold text-emerald-400 focus:border-emerald-500/60 focus:outline-none"
                  />
                </div>
              </div>

              {/* ============================================================ */}
              {/* TOGGLE DE VARIANZA (Real Weight Used vs Standard BOM)        */}
              {/* ============================================================ */}
              <div
                className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  varianceEnabled
                    ? 'bg-amber-950/40 border-amber-500/60 shadow-lg shadow-amber-500/10'
                    : 'bg-zinc-950/80 border-zinc-800'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 mt-0.5">
                    <Sliders className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-extrabold text-sm text-white">
                        Actual weight used
                      </h4>
                      {varianceEnabled && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-400 text-zinc-950 text-xs font-black uppercase">
                          Manual adjustment on
                        </span>
                      )}
                    </div>
                    <p className="text-zinc-400 text-xs mt-0.5">
                      Cooks can enter the real kg or lb used (for trim or cleaning loss) when it differs from the standard BOM.
                    </p>
                  </div>
                </div>

                {/* Toggle Switch Button */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={varianceEnabled}
                  onClick={() => setVarianceEnabled((v) => !v)}
                  className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    varianceEnabled ? 'bg-amber-400' : 'bg-zinc-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-zinc-950 shadow ring-0 transition duration-200 ease-in-out ${
                      varianceEnabled ? 'translate-x-7' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <ul className="space-y-2 sm:hidden">
                {computedBomRows.map((row) => (
                  <li key={row.ingredientProductId} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
                    <p className="text-sm font-bold text-white">{row.name}</p>
                    <p className="mt-1 text-xs text-zinc-300">
                      In production: {row.availableKitchenStock} {row.unit} · ${row.movingAvgUnitCost.toFixed(2)}/unit
                    </p>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <dt className="font-bold text-zinc-400">Standard</dt>
                        <dd className="font-mono text-zinc-100">{row.scaledStandardQty} {row.unit}</dd>
                      </div>
                      <div>
                        <dt className="font-bold text-zinc-400">Actual weight</dt>
                        <dd>
                          {varianceEnabled && row.allowVariance ? (
                            <input
                              type="number"
                              min={0.1}
                              step={0.25}
                              value={row.actualQty}
                              aria-label={`Actual weight for ${row.name}`}
                              onChange={(e) =>
                                setCustomWeights((prev) => ({
                                  ...prev,
                                  [row.ingredientProductId]: Math.max(0, Number(e.target.value) || 0),
                                }))
                              }
                              className="mt-1 min-h-11 w-full rounded-lg border border-amber-400/70 bg-zinc-950 px-2.5 py-2 text-right font-mono font-bold text-amber-200 focus:outline-none"
                            />
                          ) : (
                            <span className="font-mono font-bold text-white">
                              {row.actualQty} {row.unit}
                            </span>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-bold text-zinc-400">Variance</dt>
                        <dd className="font-mono text-zinc-100">
                          {row.varianceDelta > 0 ? '+' : ''}
                          {row.varianceDelta} {row.unit}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-bold text-zinc-400">Cost</dt>
                        <dd className="font-mono font-bold text-white">${row.lineCost.toFixed(2)}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>

              {/* BOM Ingredients Table */}
              <ScrollTable className="hidden overflow-hidden rounded-2xl border border-zinc-800 sm:block">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-zinc-950 text-xs font-bold uppercase tracking-wider text-zinc-300 border-b border-zinc-800">
                      <th className="py-3 px-4">Ingredient (production prep)</th>
                      <th className="py-3 px-3 text-right">Standard BOM</th>
                      <th className="py-3 px-3 text-right">
                        Actual weight used (kg/lb)
                      </th>
                      <th className="py-3 px-3 text-right">Variance</th>
                      <th className="py-3 px-4 text-right">MAC cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/80 text-xs">
                    {computedBomRows.map((row) => (
                      <tr key={row.ingredientProductId} className="bg-zinc-900/50">
                        <td className="py-3 px-4">
                          <div className="font-bold text-white">{row.name}</div>
                          <div className="text-xs text-zinc-300 font-mono">
                            In production: {row.availableKitchenStock}{' '}
                            {row.unit} • ${row.movingAvgUnitCost.toFixed(2)}/unit
                          </div>
                        </td>

                        <td className="py-3 px-3 text-right font-mono text-zinc-300">
                          {row.scaledStandardQty} {row.unit}
                        </td>

                        <td className="py-3 px-3 text-right">
                          {varianceEnabled && row.allowVariance ? (
                            <input
                              type="number"
                              min={0.1}
                              step={0.25}
                              value={row.actualQty}
                              onChange={(e) =>
                                setCustomWeights((prev) => ({
                                  ...prev,
                                  [row.ingredientProductId]: Math.max(
                                    0,
                                    Number(e.target.value) || 0
                                  ),
                                }))
                              }
                              className="w-24 px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-amber-400/70 text-right font-mono font-bold text-amber-300 focus:outline-none"
                            />
                          ) : (
                            <span className="font-mono font-bold text-white">
                              {row.actualQty} {row.unit}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-right font-mono">
                          {row.varianceDelta === 0 ? (
                            <span className="text-zinc-500">0.00</span>
                          ) : (
                            <span
                              className={
                                row.varianceDelta > 0
                                  ? 'text-amber-400 font-bold'
                                  : 'text-emerald-400 font-bold'
                              }
                            >
                              {row.varianceDelta > 0 ? '+' : ''}
                              {row.varianceDelta} {row.unit}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right font-mono font-bold text-white">
                          ${row.lineCost.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollTable>

              {/* Financial Batch Cost & Yield Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-2xl bg-zinc-950 border border-zinc-800">
                <div>
                  <span className="text-xs text-zinc-500 uppercase font-bold block">
                    Total batch cost
                  </span>
                  <strong className="font-mono text-base font-black tabular-nums text-white">
                    ${totalBatchCost.toFixed(2)}
                  </strong>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 uppercase font-bold block">
                    Unit output cost
                  </span>
                  <strong className="font-mono text-base font-black tabular-nums text-amber-300">
                    ${unitOutputCost.toFixed(2)} / {selectedRecipe.outputUnit}
                  </strong>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 uppercase font-bold block">
                    Suggested deli price
                  </span>
                  <strong className="font-mono text-base font-black tabular-nums text-emerald-400">
                    ${selectedRecipe.targetRetailPrice.toFixed(2)}
                  </strong>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 uppercase font-bold block">
                    Gross margin
                  </span>
                  <strong className="font-mono text-base font-black tabular-nums text-emerald-400">
                    {projectedMarginPct}%
                  </strong>
                </div>
              </div>
            </>
          ) : (
            /* Completed Batch Confirmation View */
            <div className="py-8 px-4 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-400/50 text-emerald-400 flex items-center justify-center mx-auto shadow-lg">
                <PackageCheck className="w-9 h-9" />
              </div>
              <div className="space-y-1">
                <h4 className="text-lg font-black text-white">
                  Production batch posted to prep
                </h4>
                <p className="text-xs text-zinc-400 max-w-lg mx-auto">
                  BOM inputs were deducted and{' '}
                  <strong className="text-emerald-400">
                    +{completedBatch.batchOutputQty} units
                  </strong>{' '}
                  of <strong className="text-white">{completedBatch.outputProductName}</strong> were received at a unit cost of{' '}
                  <strong className="text-amber-300">
                    ${completedBatch.unitOutputCost.toFixed(2)}
                  </strong>.
                </p>
              </div>
            </div>
          )}
        </ModalBody>

        <ModalFooter className="flex flex-col-reverse gap-2 border-zinc-800 bg-zinc-950/90 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 py-2 text-xs font-bold text-zinc-300 hover:text-white cursor-pointer sm:w-auto"
          >
            {completedBatch ? 'Close' : 'Cancel'}
          </button>

          {!completedBatch ? (
            <button
              type="button"
              onClick={handleExecuteProduction}
              disabled={submitting}
              className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-amber-400 px-6 py-3 text-sm font-black text-slate-950 shadow-lg shadow-amber-500/20 transition-all hover:bg-amber-300 active:scale-95 sm:w-auto"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Sending batch…</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 fill-slate-950" />
                  <span>{batchActionLabel(batchOutputQty, selectedRecipe.outputUnit)}</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCompletedBatch(null)}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl px-5 py-2.5 text-sm font-black bg-amber-400 hover:bg-amber-300 text-zinc-950 cursor-pointer sm:w-auto"
            >
              Make another batch
            </button>
          )}
        </ModalFooter>
    </ModalShell>
  );
};

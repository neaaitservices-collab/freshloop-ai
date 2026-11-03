'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useRole } from '@/components/auth/RoleProvider';
import { notifyInventoryUpdated } from '@/lib/domains/inventory/inventoryMoveClient';
import { resolveManufacturingRecipeId } from '@/lib/domains/manufacturing/fallbackRecipes';
import type {
  KitchenRecipeBOMIngredient,
  KitchenRecipeDefinition,
  ProductionBatchExecutedSummary,
} from '@/lib/domains/manufacturing/types';
import type { RoleName } from '@/lib/utils/roles';
import { computeScaledBatchCost } from '@/lib/domains/manufacturing/batchCost';
import { resolveLaborRatePerHour } from '@/lib/domains/manufacturing/resolveLaborRate';
import {
  ChefHat,
  X,
  Scale,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Sliders,
  PackageCheck,
  ShieldCheck,
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
  const { activeUser } = useRole();
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
        recipeLaborRate: selectedRecipe?.laborRatePerHour ?? null,
      }),
    [activeUser?.hourlyRate, selectedRecipe?.laborRatePerHour]
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

  if (!isOpen) return null;
  if (!selectedRecipe) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
        <p className="text-sm text-slate-300">No hay recetas BOM disponibles.</p>
      </div>
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

    try {
      const res = await fetch('/api/manufacturing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipe_id: selectedRecipe.recipeId,
          batch_output: batchOutputQty,
          enforce_stock_check: true,
          ingredient_overrides: ingredientOverrides,
        }),
      });

      const json = await res.json();

      if (res.status === 403) {
        const msg =
          json.error ||
          json.message ||
          'Acceso denegado: solo personal de producción puede ejecutar lotes BOM.';
        setErrorMsg(msg);
        onBatchFailed?.(msg);
        return;
      }

      if (!res.ok || json.success === false) {
        const msg = json.error || json.message || 'El lote falló en el servidor.';
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

      onBatchProduced?.(summary);
      notifyInventoryUpdated();
      window.dispatchEvent(new CustomEvent('freshloop-kitchen-inbox'));
      onClose();
    } catch {
      const msg =
        'No se pudo contactar el servidor. Revisa la conexión e intenta de nuevo.';
      setErrorMsg(msg);
      onBatchFailed?.(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md">
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/75 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-400">
              <ChefHat className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base sm:text-lg text-white">
                  Ejecución de Manufactura &amp; BOM en Producción
                </h3>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-500/30">
                  RBAC: Production only
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {activeUser?.name ?? 'Staff'} · {staffRole} — descuenta{' '}
                <code className="text-amber-300">Production prep</code> y registra el
                terminado en el ledger
                {catalogLoading ? ' · actualizando stock…' : ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-xs text-zinc-200 flex-1">
          {errorMsg && (
            <div className="p-4 rounded-2xl bg-rose-950/80 border border-rose-500/50 text-rose-200 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <div>
                <p className="font-bold text-rose-300">Salvaguarda RBAC Activada</p>
                <p>{errorMsg}</p>
              </div>
            </div>
          )}

          {!completedBatch ? (
            <>
              {/* Recipe Selector + Batch Output + RBAC Role Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                <div className="sm:col-span-6">
                  <label className="font-bold text-zinc-400 uppercase text-[10px] tracking-wider block mb-1.5">
                    Seleccionar Receta de Rescate (RecipeBOM)
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
                  <label className="font-bold text-zinc-400 uppercase text-[10px] tracking-wider block mb-1.5">
                    Porciones Producidas
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
                        Toggle de Varianza de Peso Real en Producción
                      </h4>
                      {varianceEnabled && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-400 text-zinc-950 text-[10px] font-black uppercase">
                          Ajuste Manual Activo
                        </span>
                      )}
                    </div>
                    <p className="text-zinc-400 text-[11px] mt-0.5">
                      Permite a los cocineros ajustar manualmente los kg/lbs reales utilizados (ej. por recorte de partes dañadas o merma de limpieza) si difieren del BOM estándar.
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

              {/* BOM Ingredients Table */}
              <div className="border border-zinc-800 rounded-2xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-950 text-[10px] font-bold uppercase tracking-wider text-zinc-400 border-b border-zinc-800">
                      <th className="py-3 px-4">Ingrediente (production prep)</th>
                      <th className="py-3 px-3 text-right">BOM Estándar</th>
                      <th className="py-3 px-3 text-right">
                        Peso Real Usado (kg/lbs)
                      </th>
                      <th className="py-3 px-3 text-right">Varianza</th>
                      <th className="py-3 px-4 text-right">Costo MAC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/80 text-xs">
                    {computedBomRows.map((row) => (
                      <tr key={row.ingredientProductId} className="bg-zinc-900/50">
                        <td className="py-3 px-4">
                          <div className="font-bold text-white">{row.name}</div>
                          <div className="text-[10px] text-zinc-500 font-mono">
                            Disponible en producción: {row.availableKitchenStock}{' '}
                            {row.unit} • ${row.movingAvgUnitCost.toFixed(2)}/ud
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
              </div>

              {/* Financial Batch Cost & Yield Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-2xl bg-zinc-950 border border-zinc-800">
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase font-bold block">
                    Costo Total Lote
                  </span>
                  <strong className="text-base font-black text-white font-mono">
                    ${totalBatchCost.toFixed(2)}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase font-bold block">
                    Costo Unitario Salida
                  </span>
                  <strong className="text-base font-black text-amber-300 font-mono">
                    ${unitOutputCost.toFixed(2)} / {selectedRecipe.outputUnit}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase font-bold block">
                    PVP Sugerido Deli
                  </span>
                  <strong className="text-base font-black text-emerald-400 font-mono">
                    ${selectedRecipe.targetRetailPrice.toFixed(2)}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase font-bold block">
                    Margen Bruto Real
                  </span>
                  <strong className="text-base font-black text-emerald-400 font-mono">
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
                  ¡Lote de producción registrado en prep!
                </h4>
                <p className="text-xs text-zinc-400 max-w-lg mx-auto">
                  Se descontaron los insumos del BOM y se ingresaron{' '}
                  <strong className="text-emerald-400">
                    +{completedBatch.batchOutputQty} unidades
                  </strong>{' '}
                  de <strong className="text-white">{completedBatch.outputProductName}</strong> a un costo unitario de{' '}
                  <strong className="text-amber-300">
                    ${completedBatch.unitOutputCost.toFixed(2)}
                  </strong>.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-4 border-t border-zinc-800 bg-zinc-950/90 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-400 hover:text-white cursor-pointer"
          >
            {completedBatch ? 'Cerrar' : 'Cancelar'}
          </button>

          {!completedBatch ? (
            <button
              type="button"
              onClick={handleExecuteProduction}
              disabled={submitting}
              className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-emerald-400 px-6 py-3 text-xs font-black text-slate-950 shadow-lg shadow-amber-500/20 transition-all hover:from-amber-300 hover:to-emerald-300 active:scale-95"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Enviando lote…</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 fill-slate-950" />
                  <span>
                    Execute batch (+{batchOutputQty}{' '}
                    {selectedRecipe.outputUnit})
                  </span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCompletedBatch(null)}
              className="px-5 py-2.5 rounded-xl text-xs font-black bg-amber-400 hover:bg-amber-300 text-zinc-950 cursor-pointer"
            >
              Producir Otro Lote
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

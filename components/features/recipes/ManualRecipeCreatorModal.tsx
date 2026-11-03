'use client';

import React, { useEffect, useState } from 'react';
import { ChefHat, Plus, Trash2, X, AlertCircle, CheckCircle2, Loader2, Sparkles, Scale } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { computeRecipeBatchCost } from '@/lib/domains/manufacturing/batchCost';

interface InventoryProductOption {
  id: string;
  name: string;
  department: string;
  unitType: string;
  standardCost: number | null;
  retailPrice: number | null;
}

interface IngredientLine {
  productId: string;
  quantity: number | '';
  unit: string;
}

type DbRecipePayload = {
  id: string;
  name: string;
  category?: string | null;
  yieldPortions?: number;
  targetRetailPrice?: number;
  instructions?: string | null;
  laborHours?: number | null;
  laborRate?: number | null;
  packagingCostPerUnit?: number | null;
  outputProduct?: { unitType?: string };
  bomLines?: Array<{
    ingredientProductId: string;
    quantityRequired: number;
    unit?: string;
    ingredientProduct?: { unitType?: string };
  }>;
};

interface ManualRecipeCreatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** When set, modal loads this recipe and PATCHes on save. */
  editRecipeId?: string | null;
  onRecipeCreated?: (newRecipe: Record<string, unknown>) => void;
  onRecipeUpdated?: (recipe: Record<string, unknown>) => void;
}

export function ManualRecipeCreatorModal({
  isOpen,
  onClose,
  editRecipeId = null,
  onRecipeCreated,
  onRecipeUpdated,
}: ManualRecipeCreatorModalProps) {
  const [recipeName, setRecipeName] = useState('');
  const [category, setCategory] = useState('Salad / Panzanella');
  const [yieldPortions, setYieldPortions] = useState<number | ''>(10);
  const [outputUnit, setOutputUnit] = useState('TUB');
  const [targetRetailPrice, setTargetRetailPrice] = useState<number | ''>(7.99);
  const [instructions, setInstructions] = useState('');
  const [laborHours, setLaborHours] = useState<number | ''>(0.5);
  const [laborRate, setLaborRate] = useState<number | ''>(17.6);
  const [packagingCostPerUnit, setPackagingCostPerUnit] = useState<number | ''>(1);
  const [lines, setLines] = useState<IngredientLine[]>([
    { productId: '', quantity: 1, unit: 'LBS' },
  ]);

  const [products, setProducts] = useState<InventoryProductOption[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isEditMode = Boolean(editRecipeId);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setLoadingProducts(true);

    fetch('/api/recipes', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.inventoryProducts)) {
          setProducts(data.inventoryProducts);
        }

        if (editRecipeId && data.success && Array.isArray(data.recipes)) {
          const raw = (data.recipes as DbRecipePayload[]).find((r) => r.id === editRecipeId);
          if (raw) {
            setRecipeName(raw.name ?? '');
            setCategory(raw.category ?? 'Prepared Hot Meal');
            setYieldPortions(raw.yieldPortions ?? 10);
            setOutputUnit(raw.outputProduct?.unitType ?? 'TUB');
            setTargetRetailPrice(raw.targetRetailPrice ?? 7.99);
            setInstructions(raw.instructions ?? '');
            setLaborHours(raw.laborHours ?? 0.5);
            setLaborRate(raw.laborRate ?? 17.6);
            setPackagingCostPerUnit(raw.packagingCostPerUnit ?? 1);
            const bom = raw.bomLines ?? [];
            if (bom.length > 0) {
              setLines(
                bom.map((line) => ({
                  productId: line.ingredientProductId,
                  quantity: line.quantityRequired,
                  unit:
                    line.unit ??
                    line.ingredientProduct?.unitType ??
                    'LBS',
                }))
              );
            }
          } else {
            setErrorMsg('Could not load this recipe for editing.');
          }
        } else if (!editRecipeId) {
          setRecipeName('');
          setCategory('Salad / Panzanella');
          setYieldPortions(10);
          setOutputUnit('TUB');
          setTargetRetailPrice(7.99);
          setInstructions('');
          setLaborHours(0.5);
          setLaborRate(17.6);
          setPackagingCostPerUnit(1);
          const first = data.inventoryProducts?.[0];
          setLines([
            {
              productId: first?.id ?? '',
              quantity: 2,
              unit: first?.unitType || 'LBS',
            },
          ]);
        }
      })
      .catch(() => {
        setErrorMsg('Could not fetch active inventory items.');
      })
      .finally(() => {
        setLoadingProducts(false);
      });
  }, [isOpen, editRecipeId]);

  if (!isOpen) return null;

  const handleAddLine = () => {
    const defaultProduct = products[0]?.id ?? '';
    const defaultUnit = products[0]?.unitType ?? 'LBS';
    setLines((prev) => [...prev, { productId: defaultProduct, quantity: 1, unit: defaultUnit }]);
  };

  const handleRemoveLine = (index: number) => {
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleLineProductChange = (index: number, productId: string) => {
    const chosen = products.find((p) => p.id === productId);
    setLines((prev) =>
      prev.map((line, idx) =>
        idx === index
          ? {
              ...line,
              productId,
              unit: chosen?.unitType ?? line.unit,
            }
          : line
      )
    );
  };

  const handleLineQtyChange = (index: number, val: string) => {
    const num = val === '' ? '' : parseFloat(val);
    setLines((prev) =>
      prev.map((line, idx) => (idx === index ? { ...line, quantity: num } : line))
    );
  };

  const ingredientCost = lines.reduce((acc, line) => {
    if (!line.productId || typeof line.quantity !== 'number') return acc;
    const prod = products.find((p) => p.id === line.productId);
    const unitCost = prod?.standardCost ?? 0;
    return acc + unitCost * line.quantity;
  }, 0);

  const yieldNum = typeof yieldPortions === 'number' ? yieldPortions : 0;
  const batchEconomics = computeRecipeBatchCost({
    ingredientCost,
    laborHours: typeof laborHours === 'number' ? laborHours : 0,
    laborRatePerHour: typeof laborRate === 'number' ? laborRate : 17.6,
    packagingCostPerUnit: typeof packagingCostPerUnit === 'number' ? packagingCostPerUnit : 0,
    yieldUnits: yieldNum,
  });

  const price = typeof targetRetailPrice === 'number' ? targetRetailPrice : 0;
  const marginPct = batchEconomics.grossMarginPct(price);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!recipeName.trim()) {
      setErrorMsg('Please give your recipe a name.');
      return;
    }

    if (!yieldPortions || yieldPortions <= 0) {
      setErrorMsg('Enter a valid portion yield.');
      return;
    }

    const validIngredients = lines.filter(
      (l) => l.productId && typeof l.quantity === 'number' && l.quantity > 0
    );

    if (validIngredients.length === 0) {
      setErrorMsg('Add at least one ingredient with a quantity greater than zero.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: recipeName.trim(),
        category,
        yieldPortions,
        outputUnit,
        targetRetailPrice: price,
        instructions,
        laborHours: typeof laborHours === 'number' ? laborHours : 0,
        laborRate: typeof laborRate === 'number' ? laborRate : 17.6,
        packagingCostPerUnit:
          typeof packagingCostPerUnit === 'number' ? packagingCostPerUnit : 0,
        ingredients: validIngredients,
      };

      const res = await fetch(
        isEditMode && editRecipeId ? `/api/recipes/${editRecipeId}` : '/api/recipes',
        {
          method: isEditMode ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      const json = await res.json();
      if (!res.ok || !json.success) {
        setErrorMsg(
          (typeof json.error === 'string' && json.error) ||
            (typeof json.message === 'string' && json.message) ||
            'Failed to save recipe.'
        );
        return;
      }

      if (isEditMode) onRecipeUpdated?.(json.recipe);
      else onRecipeCreated?.(json.recipe);
      onClose();
    } catch {
      setErrorMsg('Network error while saving the recipe.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-4 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2 text-emerald-400">
              <ChefHat className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white">
                {isEditMode ? 'Edit Production Recipe (BOM)' : 'Create Production Recipe (BOM)'}
              </h2>
              <p className="text-xs text-slate-400">
                {isEditMode
                  ? 'Update yield, pricing, and ingredients — saved to the live BOM catalog.'
                  : 'Define a standard bill of materials directly from current raw inventory.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {errorMsg ? (
            <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-semibold text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          ) : null}

          {/* Basic Fields */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-300">
                Recipe Output Name *
              </label>
              <Input
                type="text"
                placeholder="e.g. Garden Herb Roasted Tomato Soup"
                value={recipeName}
                onChange={(e) => setRecipeName(e.target.value)}
                required
                className="text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-300">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 focus:border-emerald-500/50"
              >
                <option value="Soup">Soup</option>
                <option value="Salad / Panzanella">Salad / Panzanella</option>
                <option value="Prepared Grab-n-Go">Prepared Grab-n-Go</option>
                <option value="Bakery">Bakery</option>
                <option value="Parfait">Parfait</option>
                <option value="Deli Main">Deli Main</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-300">Batch Yield (Units) *</label>
              <Input
                type="number"
                min="1"
                step="1"
                value={yieldPortions}
                onChange={(e) => setYieldPortions(e.target.value === '' ? '' : parseFloat(e.target.value))}
                required
                className="text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-300">Packaging Unit</label>
              <select
                value={outputUnit}
                onChange={(e) => setOutputUnit(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 focus:border-emerald-500/50"
              >
                <option value="TUB">Tub / Container</option>
                <option value="UNIT">Unit / Pack</option>
                <option value="LOAF">Loaf</option>
                <option value="KG">Kilogram</option>
                <option value="LITER">Liter</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-300">Target Shelf Price ($)</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={targetRetailPrice}
                onChange={(e) => setTargetRetailPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                className="text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-300">Labor (hours / batch)</label>
              <Input
                type="number"
                min="0"
                step="0.25"
                value={laborHours}
                onChange={(e) =>
                  setLaborHours(e.target.value === '' ? '' : parseFloat(e.target.value))
                }
                className="text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-300">Labor rate ($/hr)</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={laborRate}
                onChange={(e) =>
                  setLaborRate(e.target.value === '' ? '' : parseFloat(e.target.value))
                }
                className="text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-300">Packaging ($ / unit)</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={packagingCostPerUnit}
                onChange={(e) =>
                  setPackagingCostPerUnit(
                    e.target.value === '' ? '' : parseFloat(e.target.value)
                  )
                }
                className="text-xs"
              />
            </div>
          </div>

          {/* Ingredient BOM Lines */}
          <div className="rounded-xl border border-slate-800/90 bg-slate-900/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scale className="h-4 w-4 text-emerald-400" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-200">
                  Bill of Materials (Raw Ingredients from Inventory)
                </h3>
              </div>
              <button
                type="button"
                onClick={handleAddLine}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Ingredient
              </button>
            </div>

            {loadingProducts ? (
              <div className="flex items-center gap-2 py-4 text-xs text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                <span>Loading available inventory items…</span>
              </div>
            ) : (
              <div className="space-y-2">
                {lines.map((line, index) => {
                  const chosen = products.find((p) => p.id === line.productId);
                  return (
                    <div
                      key={index}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/70 p-2 sm:flex-nowrap"
                    >
                      <div className="flex-1 min-w-[200px]">
                        <select
                          value={line.productId}
                          onChange={(e) => handleLineProductChange(index, e.target.value)}
                          className="w-full rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500/50"
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.department}) · Standard cost ${p.standardCost?.toFixed(2) ?? '0.00'}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="w-24">
                        <Input
                          type="number"
                          step="0.01"
                          min="0.01"
                          placeholder="Qty"
                          value={line.quantity}
                          onChange={(e) => handleLineQtyChange(index, e.target.value)}
                          className="h-8 text-xs py-1"
                        />
                      </div>

                      <div className="w-20 text-[11px] font-mono font-bold text-slate-400">
                        {chosen?.unitType ?? line.unit}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveLine(index)}
                        disabled={lines.length <= 1}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/20 hover:text-rose-400 disabled:opacity-30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Financial Summary Preview */}
            <div className="mt-3 grid gap-2 border-t border-slate-800/80 pt-3 text-xs sm:grid-cols-2">
              <span className="text-slate-400">
                Ingredients: <strong className="text-white">${batchEconomics.ingredientCost.toFixed(2)}</strong>
              </span>
              <span className="text-slate-400">
                Labor: <strong className="text-white">${batchEconomics.laborCost.toFixed(2)}</strong>
              </span>
              <span className="text-slate-400">
                Packaging: <strong className="text-white">${batchEconomics.packagingCost.toFixed(2)}</strong>
              </span>
              <span className="text-slate-400">
                Total batch: <strong className="text-white">${batchEconomics.totalBatchCost.toFixed(2)}</strong>
              </span>
              <span className="text-slate-400">
                Cost / unit: <strong className="text-white">${batchEconomics.unitCost.toFixed(2)}</strong>
              </span>
              <span className="text-slate-400">
                Gross margin @ shelf:{' '}
                <strong className={marginPct >= 40 ? 'text-emerald-400' : 'text-amber-400'}>
                  {marginPct}%
                </strong>
              </span>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-300">
              Production prep notes / instructions (optional)
            </label>
            <textarea
              rows={2}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Rough chop roasted tomatoes and simmer with herbs for 20 minutes before blending."
              className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-emerald-500/50"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={submitting}
              className="border-emerald-500/50 bg-emerald-500 text-slate-950 hover:bg-emerald-400 font-bold"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving Recipe…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  {isEditMode ? 'Save changes' : 'Save Production Recipe'}
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

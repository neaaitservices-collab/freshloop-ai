import { z } from 'zod';
import { optionalSafeText, productIdSchema, safeText } from '@/lib/security/schemas/common';

const recipeIngredientSchema = z
  .object({
    productId: productIdSchema,
    quantity: z.number().finite().positive().max(1_000_000),
    unit: optionalSafeText(32),
  })
  .strict();

const recipeCoreSchema = z.object({
  name: safeText(200),
  category: optionalSafeText(100),
  yieldPortions: z.number().finite().positive().max(100_000),
  portionSize: optionalSafeText(64),
  targetRetailPrice: z.number().finite().min(0).max(1_000_000).optional(),
  instructions: optionalSafeText(8000),
  outputUnit: optionalSafeText(32),
  laborHours: z.number().finite().min(0).max(10_000).optional(),
  laborRate: z.number().finite().min(0).max(10_000).optional(),
  packagingCostPerUnit: z.number().finite().min(0).max(1_000_000).optional(),
  ingredients: z.array(recipeIngredientSchema).min(1).max(100),
});

export const recipeCreateBodySchema = recipeCoreSchema.strict();

export const recipeUpdateBodySchema = recipeCoreSchema.strict();

export const recipeIdParamSchema = z.string().trim().min(1).max(128);

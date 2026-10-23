/**
 * Legacy demo helpers (`getInventoryItems`, fusion memory store). Production floor
 * stock and KPIs use `lib/inventory.ts` + `lib/stock.ts` (Prisma ledger).
 */
import { PrismaClient } from '@prisma/client';
import { INITIAL_INVENTORY_ITEMS, INITIAL_FUSION_RECIPES } from '@/lib/legacy/mockData';
import {
  InventoryItem,
  RecipeFusionResult,
  InvoiceOcrResult,
  VoiceLoggerResult,
} from '@/lib/types';

// Global Prisma instance for Next.js hot reload prevention with fallback mock
const globalForPrisma = global as unknown as { prisma: any };

let prismaInstance: any;
try {
  prismaInstance = globalForPrisma.prisma || new PrismaClient();
  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prismaInstance;
} catch {
  console.warn('[AI Studio] Database not connected — using mock');
  const noOp = {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
    create: async (d: any) => d?.data ?? {},
    update: async (d: any) => d?.data ?? {},
    delete: async () => ({})
  };
  prismaInstance = new Proxy({}, { get: () => noOp });
}

export const prisma = prismaInstance;

// In-Memory store fallback when database is not configured
let inMemoryInventory: InventoryItem[] = [...INITIAL_INVENTORY_ITEMS];
let inMemoryRecipes: RecipeFusionResult[] = [...INITIAL_FUSION_RECIPES];

/**
 * Fetch Inventory items filtered by optional status and max days remaining
 */
export async function getInventoryItems(options?: {
  status?: string;
  pullThresholdDays?: number;
}): Promise<InventoryItem[]> {
  try {
    if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost:5432')) {
      const whereClause: any = {};
      if (options?.status && options.status !== 'ALL') {
        whereClause.status = options.status;
      }

      const items = await prisma.inventoryItem.findMany({
        where: whereClause,
        orderBy: { expirationDate: 'asc' }
      });

      return items.map((item: any) => {
        const today = new Date();
        const exp = new Date(item.expirationDate);
        const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 3600 * 24));

        return {
          id: item.id,
          name: item.name,
          department: item.department as any,
          quantity: item.quantity,
          unit: item.unit || 'cases',
          casePackSize: item.casePackSize || 40,
          subUnit: item.subUnit || 'lbs',
          receivedCost: item.receivedCost,
          receivedDate: item.receivedDate.toISOString().split('T')[0],
          expirationDate: item.expirationDate.toISOString().split('T')[0],
          daysRemaining: diffDays,
          condition: item.condition as any,
          status: item.status as any,
          pullThresholdDays: item.pullThresholdDays,
          location: item.location,
          notes: item.notes || undefined
        };
      });
    }
  } catch (err) {
    console.warn('Prisma DB query failed or not configured, using in-memory store:', err);
  }

  // Fallback to in-memory store
  let filtered = [...inMemoryInventory];
  if (options?.status && options.status !== 'ALL') {
    filtered = filtered.filter(item => item.status === options.status);
  }
  return filtered;
}

/**
 * Add items parsed from Vendor Invoice OCR to Inventory
 */
export async function addInvoiceItemsToInventory(ocrData: InvoiceOcrResult): Promise<InventoryItem[]> {
  const newItems: InventoryItem[] = ocrData.lineItems.map((line, idx) => {
    const today = new Date();
    // Default shelf life based on department
    let defaultShelfDays = 7;
    if (line.department === 'PRODUCE') defaultShelfDays = 5;
    if (line.department === 'DAIRY') defaultShelfDays = 8;
    if (line.department === 'BAKERY') defaultShelfDays = 4;
    if (line.department === 'PANTRY') defaultShelfDays = 30;

    const expDate = new Date();
    expDate.setDate(today.getDate() + defaultShelfDays);

    return {
      id: `inv-ocr-${Date.now()}-${idx}`,
      name: line.name,
      department: line.department,
      quantity: line.quantity,
      unit: line.unit || 'cases',
      casePackSize: line.casePackSize || 40,
      subUnit: line.subUnit || 'lbs',
      receivedCost: line.unitCost,
      receivedDate: today.toISOString().split('T')[0],
      expirationDate: expDate.toISOString().split('T')[0],
      daysRemaining: defaultShelfDays,
      condition: 'Pristine',
      status: 'FRESH',
      pullThresholdDays: 3,
      location: `Department - ${line.department}`,
      notes: `Imported from Invoice ${ocrData.invoiceNumber} (${ocrData.vendorName})`,
      batchCode: `OCR-${ocrData.invoiceNumber}`
    };
  });

  inMemoryInventory = [...newItems, ...inMemoryInventory];
  return newItems;
}

/**
 * Add item from Voice Logger
 */
export async function addVoiceLogItemToInventory(voiceResult: VoiceLoggerResult): Promise<InventoryItem[]> {
  const newItems: InventoryItem[] = voiceResult.parsedItems.map((item, idx) => {
    const today = new Date();
    const expDate = new Date();
    expDate.setDate(today.getDate() + 2); // default short-dated for voice transfers

    let status: any = 'PULL_RESCUE';
    if (voiceResult.targetAction === 'MARKDOWN') status = 'MARKDOWN';
    if (voiceResult.targetAction === 'DISCARD') status = 'DISCARDED';

    return {
      id: `inv-voice-${Date.now()}-${idx}`,
      name: item.name,
      department: item.department,
      quantity: item.quantity || 1,
      unit: item.unit || 'cases',
      casePackSize: item.casePackSize || 40,
      subUnit: item.subUnit || 'lbs',
      receivedCost: 40.00,
      receivedDate: today.toISOString().split('T')[0],
      expirationDate: expDate.toISOString().split('T')[0],
      daysRemaining: 2,
      condition: item.condition as any,
      status: status,
      pullThresholdDays: 3,
      location: 'Kitchen Prep Transfer',
      notes: `Floor voice logger transfer. Action: ${voiceResult.targetAction}`
    };
  });

  inMemoryInventory = [...newItems, ...inMemoryInventory];
  return newItems;
}

/**
 * Save Fusion Recipe
 */
export async function saveFusionRecipe(recipe: RecipeFusionResult): Promise<RecipeFusionResult> {
  const existingIdx = inMemoryRecipes.findIndex((r) => r.id === recipe.id);
  if (existingIdx !== -1) {
    inMemoryRecipes[existingIdx] = recipe;
  } else {
    inMemoryRecipes = [recipe, ...inMemoryRecipes];
  }
  return recipe;
}

/**
 * Fetch Fusion Recipes
 */
export async function getFusionRecipes(): Promise<RecipeFusionResult[]> {
  return inMemoryRecipes;
}

/**
 * Update Inventory Item Status or Pull Threshold
 */
export async function updateInventoryItem(id: string, updates: Partial<InventoryItem>): Promise<InventoryItem | null> {
  const itemIndex = inMemoryInventory.findIndex(i => i.id === id);
  if (itemIndex !== -1) {
    inMemoryInventory[itemIndex] = { ...inMemoryInventory[itemIndex], ...updates };
    return inMemoryInventory[itemIndex];
  }
  return null;
}

/**
 * @deprecated Do not use for new features. Floor stock and KPIs use
 * `lib/domains/inventory/*`; use `@/lib/db/prisma` if Prisma is required.
 */
import { prisma as sharedPrisma } from '@/lib/db/prisma';
import { INITIAL_INVENTORY_ITEMS } from '@/lib/legacy/mockData';
import {
  InventoryItem,
  RecipeFusionResult,
  InvoiceOcrResult,
  VoiceLoggerResult,
} from '@/lib/types';

export const prisma = sharedPrisma;

// In-Memory store fallback when database is not configured
let inMemoryInventory: InventoryItem[] = [...INITIAL_INVENTORY_ITEMS];

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
/** @deprecated Use `@/lib/domains/kitchen/recipeFusionStore` */
export async function saveFusionRecipe(recipe: RecipeFusionResult): Promise<RecipeFusionResult> {
  const { saveFusionRecipe: persist } = await import('@/lib/domains/kitchen/recipeFusionStore');
  return persist(recipe);
}

/** @deprecated Use `@/lib/domains/kitchen/recipeFusionStore` */
export async function getFusionRecipes(): Promise<RecipeFusionResult[]> {
  const { listFusionRecipes } = await import('@/lib/domains/kitchen/recipeFusionStore');
  return listFusionRecipes();
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

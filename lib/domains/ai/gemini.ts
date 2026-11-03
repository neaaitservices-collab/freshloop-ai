import {
  InvoiceOcrResult,
  VoiceLoggerResult,
  RecipeFusionResult,
  InventoryItem,
} from '@/lib/types';

/**
 * Parses model output that should be JSON (handles markdown fences and common wrappers).
 */
export function parseModelJson<T = unknown>(raw: string): T {
  let text = raw.trim();
  if (!text) {
    throw new SyntaxError('Empty model response');
  }
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  const firstBrace = text.search(/[{[]/);
  if (firstBrace > 0) {
    text = text.slice(firstBrace);
  }
  const lastChar = text.endsWith(']') ? text.lastIndexOf(']') : text.lastIndexOf('}');
  if (lastChar >= 0 && lastChar < text.length - 1) {
    text = text.slice(0, lastChar + 1);
  }

  const parsed: unknown = JSON.parse(text);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    if (obj.data && typeof obj.data === 'object') {
      return obj.data as T;
    }
    if (obj.result && typeof obj.result === 'object') {
      return obj.result as T;
    }
  }
  return parsed as T;
}

/** Returns null instead of throwing when model output is not valid JSON. */
export function tryParseModelJson<T = unknown>(raw: string): T | null {
  try {
    return parseModelJson<T>(raw);
  } catch {
    return null;
  }
}

function getApiKey(): string | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'your_gemini_api_key_here') {
    return null;
  }
  return apiKey.trim();
}

/**
 * Loads `@google/generative-ai` at runtime so bundlers stay resilient while dependencies settle.
 */
function getGenAIClient(apiKey: string): { client: any } | null {
  try {
    const safeRequire = new Function(
      'name',
      'try { return require(name); } catch(e) { return null; }'
    );
    const generativeAiMod = safeRequire('@google/generative-ai');
    if (generativeAiMod && generativeAiMod.GoogleGenerativeAI) {
      return { client: new generativeAiMod.GoogleGenerativeAI(apiKey) };
    }
  } catch {
    // Dynamic loader fallback
  }
  return null;
}

/**
 * Direct REST API fallback supporting OAuth Bearer tokens (AQ.xxx) & API keys (AIzaSyxxx)
 */
export async function generateContentWithFallback(
  promptText: string,
  inlinePart?: { data: string; mimeType: string },
  preferredModels: string[] = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash']
): Promise<{ text: string; modelUsed: string }> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY missing or empty');
  }

  const failures: string[] = [];

  const remember = (modelName: string, detail: string) => {
    const safe = detail.replace(apiKey, '[key]').slice(0, 240);
    failures.push(`${modelName}: ${safe}`);
  };

  let listedModels: string[] = [];
  try {
    const listResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=100`
    );
    if (listResponse.ok) {
      const listed = await listResponse.json();
      listedModels = (listed.models || [])
        .filter((model: { supportedGenerationMethods?: string[] }) =>
          model.supportedGenerationMethods?.includes('generateContent')
        )
        .map((model: { name?: string }) => String(model.name || '').replace(/^models\//, ''))
        .filter(Boolean);
    }
  } catch {
    listedModels = [];
  }

  const ranked = (listedModels.length ? listedModels : preferredModels)
    .slice()
    .sort((a, b) => {
      const score = (name: string) => {
        if (/flash/.test(name) && !/lite|image|tts|live/.test(name)) return 0;
        if (/flash/.test(name)) return 1;
        return 2;
      };
      return score(a) - score(b);
    })
    .slice(0, 4);

  const modelsToTry = ranked.length ? ranked : preferredModels;

  for (const modelName of modelsToTry) {
    try {
      const sdk = getGenAIClient(apiKey);
      if (sdk) {
        try {
          const model = sdk.client.getGenerativeModel({
            model: modelName,
            generationConfig: { responseMimeType: 'application/json' },
          });
          const parts: any[] = [{ text: promptText }];
          if (inlinePart) {
            parts.push({
              inlineData: {
                data: inlinePart.data,
                mimeType: inlinePart.mimeType,
              },
            });
          }
          const result = await model.generateContent(parts);
          const text = result.response.text();
          if (text) {
            return { text, modelUsed: modelName };
          }
        } catch (e: any) {
          remember(modelName, e?.message || 'SDK request failed');
        }
      }

      const parts: any[] = [{ text: promptText }];
      if (inlinePart) {
        parts.push({ inlineData: inlinePart });
      }
      const payload = JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: 'application/json' },
      });

      const attempts: Array<{ label: string; url: string; headers: Record<string, string> }> = [
        {
          label: 'key',
          url: `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`,
          headers: { 'Content-Type': 'application/json' },
        },
      ];
      if (apiKey.startsWith('AQ.')) {
        attempts.push({
          label: 'bearer',
          url: `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
        });
      }

      let keyUnauthorized = false;
      for (const attempt of attempts) {
        if (attempt.label === 'bearer' && !keyUnauthorized) continue;
        try {
          const response = await fetch(attempt.url, {
            method: 'POST',
            headers: attempt.headers,
            body: payload,
          });
          const raw = await response.text();
          if (response.ok) {
            const data = JSON.parse(raw);
            const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (responseText) {
              return { text: responseText, modelUsed: modelName };
            }
            remember(modelName, `${attempt.label} returned no text`);
          } else {
            if (attempt.label === 'key' && (response.status === 401 || response.status === 403)) {
              keyUnauthorized = true;
            }
            remember(modelName, `${attempt.label} ${response.status} ${raw.slice(0, 180)}`);
          }
        } catch (e: any) {
          remember(modelName, `${attempt.label} ${e?.message || 'request failed'}`);
        }
      }
    } catch (err: any) {
      remember(modelName, err?.message || 'request failed');
    }
  }

  console.warn('[gemini] tried', modelsToTry.join(', '));
  console.warn('[gemini] model failures', failures.join(' | '));
  const keyLines = failures.filter((line) => line.includes(': key '));
  const rejected =
    keyLines.length > 0 &&
    keyLines.every(
      (line) => line.includes('401') || line.includes('403') || line.includes('API_KEY_INVALID')
    );
  throw new Error(
    rejected
      ? 'The photo could not be read. The Gemini key on this store was rejected.'
      : failures[0] || 'The invoice reader could not reach the model.'
  );
}

/**
 * Extract Vendor Invoice details using Gemini Vision OCR
 */
export async function processInvoiceOcr(base64Image: string, mimeType: string = 'image/jpeg'): Promise<InvoiceOcrResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    const mock = getMockOcrResult();
    if (base64Image) {
      mock.rawSummary = '⚠️ GEMINI_API_KEY is missing in .env.local. Set your GEMINI_API_KEY to analyze uploaded invoice images.';
    }
    return mock;
  }

  try {
    const prompt = `You are an expert Grocery Vendor Invoice OCR system for FreshLoop AI.
Analyze this invoice image and extract structured data in JSON format adhering strictly to this schema:
{
  "vendorName": "string (e.g. Organic Produce Co, Golden State Dairy, Sunset Bakery Supplies)",
  "invoiceNumber": "string",
  "invoiceDate": "YYYY-MM-DD",
  "totalAmount": number,
  "departmentBreakdown": {
    "PRODUCE": number,
    "DAIRY": number,
    "BAKERY": number,
    "PANTRY": number
  },
  "lineItems": [
    {
      "name": "string (item description)",
      "department": "PRODUCE" | "DAIRY" | "BAKERY" | "PANTRY",
      "quantity": number (number of cases/crates),
      "unit": "cases",
      "casePackSize": number (e.g. 40 for 40lb case, 7 for 7ct case, 24 for 24 bunch case, 4 for 4L case),
      "subUnit": "lbs" | "kg" | "g" | "oz" | "units" | "ml" | "L" | "fl oz" | "bunches" | "loaves" | "tubs" | "boxes",
      "unitCost": number (cost per case),
      "totalCost": number
    }
  ]
}

Classification rules:
- Classify fresh fruit, vegetables, herbs as "PRODUCE".
- Classify milk, cream, cheese, yogurt, butter, eggs as "DAIRY".
- Classify bread, pastries, flour, yeast, buns as "BAKERY".
- Classify oils, spices, canned goods, sauces, grains as "PANTRY".
Make sure totalAmount equals sum of department totals and line item costs. Format costs as float numbers.`;

    const cleanData = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;

    const { text, modelUsed } = await generateContentWithFallback(
      prompt,
      cleanData ? { data: cleanData, mimeType: mimeType || 'image/jpeg' } : undefined
    );

    const parsed = parseModelJson<Record<string, unknown>>(text);

    const dept = parsed.departmentBreakdown as InvoiceOcrResult['departmentBreakdown'] | undefined;

    return {
      vendorName: String(parsed.vendorName || 'Fresh Grocer Wholesale'),
      invoiceNumber: String(
        parsed.invoiceNumber || `INV-${Math.floor(Math.random() * 90000 + 10000)}`
      ),
      invoiceDate: String(parsed.invoiceDate || new Date().toISOString().split('T')[0]),
      totalAmount: Number(parsed.totalAmount) || 0,
      departmentBreakdown: dept || { PRODUCE: 0, DAIRY: 0, BAKERY: 0, PANTRY: 0 },
      lineItems: (parsed.lineItems as InvoiceOcrResult['lineItems']) || [],
      rawSummary: `Extracted ${Array.isArray(parsed.lineItems) ? parsed.lineItems.length : 0} line items with ${modelUsed}.`
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error in processInvoiceOcr Gemini call:', message);
    throw error instanceof Error ? error : new Error(message);
  }
}

/**
 * Ambient Voice Floor Logger using Gemini Audio parsing
 */
export async function processVoiceFloorLog(
  audioBase64?: string,
  mimeType: string = 'audio/webm',
  spokenText?: string
): Promise<VoiceLoggerResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return getMockVoiceResult(spokenText);
  }

  try {
    const prompt = `You are Ambient Voice Floor Logger for FreshLoop AI in a fresh grocery store / kitchen.
Your task is to listen to spoken floor audio or transcript (e.g., "Logged 10 lbs bruised apples and 4L heavy cream") and return structured JSON adhering to this schema:
{
  "transcript": "string (verbatim transcript of spoken audio)",
  "targetAction": "KITCHEN_RESCUE" | "MARKDOWN" | "DISCARD",
  "parsedItems": [
    {
      "name": "string",
      "quantity": number,
      "unit": "lbs" | "Liters" | "kg" | "units" | "cases" | "loaves",
      "department": "PRODUCE" | "DAIRY" | "BAKERY" | "PANTRY",
      "condition": "Pristine" | "Slightly Blemished" | "Bruised" | "Overripe" | "Near Expiry",
      "allergenWarnings": ["string"]
    }
  ],
  "kitchenRescueNotes": "string (suggested immediate kitchen action or store markdown note)",
  "estimatedWasteSavedValue": number
}

Rules:
- If items are bruised, overripe, or short-dated but safe for cooking, recommend targetAction = "KITCHEN_RESCUE".
- If items are pristine or slightly past display peak, recommend targetAction = "MARKDOWN".
- If items are spoiled/damaged beyond safe use, recommend targetAction = "DISCARD".
- Identify allergens (Milk, Eggs, Wheat, Soy, Tree Nuts, Peanuts, Fish, Shellfish).`;

    let cleanAudio = '';
    if (audioBase64) {
      cleanAudio = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
    }

    const { text } = await generateContentWithFallback(
      prompt + (spokenText ? `\nSpoken Text: "${spokenText}"` : ''),
      cleanAudio ? { data: cleanAudio, mimeType: mimeType || 'audio/webm' } : undefined
    );

    const parsed = parseModelJson<Record<string, unknown>>(text);

    return {
      transcript: String(parsed.transcript || spokenText || 'Logged 10 lbs bruised apples and 4L heavy cream'),
      targetAction: (parsed.targetAction as VoiceLoggerResult['targetAction']) || 'KITCHEN_RESCUE',
      parsedItems: (parsed.parsedItems as VoiceLoggerResult['parsedItems']) || [],
      kitchenRescueNotes: String(
        parsed.kitchenRescueNotes ||
          'Transfer items immediately to prep kitchen for Recipe Fusion.'
      ),
      estimatedWasteSavedValue: Number(parsed.estimatedWasteSavedValue) || 38.5,
    };
  } catch (error) {
    console.error('Error in processVoiceFloorLog Gemini call:', error);
    return getMockVoiceResult(spokenText);
  }
}

/**
 * Cross-Department Recipe Fusion Engine using Gemini 1.5 Flash
 */
export async function processRecipeFusion(
  shortDatedItems: InventoryItem[],
  targetCategory?: string
): Promise<RecipeFusionResult[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return getMockRecipeFusion();
  }

  try {
    const itemsSummary = shortDatedItems.map(i => `${i.name} (${i.quantity} ${i.unit}, ${i.department}, Condition: ${i.condition}, Days Left: ${i.daysRemaining})`).join('\n');

    const prompt = `You are the Executive Chef and Yield Management AI for FreshLoop AI.
Analyze these short-dated/excess inventory items from different departments:
${itemsSummary}

Generate 2 innovative, high-margin prepared food recipes (e.g. Soups, Panzanella Salads, Parfaits, Prepared Meals, Bakery Loaves) that cross-match items across Produce, Dairy, Bakery, and Pantry to rescue food waste and maximize grocery profit margin.

Return a JSON array of recipes adhering strictly to this schema:
[
  {
    "id": "string (uuid or rec-xxx)",
    "recipeName": "string",
    "category": "Soup" | "Salad / Panzanella" | "Parfait / Dessert" | "Prepared Hot Meal" | "Bakery / Bread",
    "ingredientsUsed": [
      {
        "name": "string",
        "quantity": "string",
        "department": "PRODUCE" | "DAIRY" | "BAKERY" | "PANTRY",
        "inventoryItemId": "string",
        "estimatedCost": number
      }
    ],
    "estimatedYield": "string (e.g., 20 Portions (12 oz deli container))",
    "estimatedCost": number (total food cost for full batch),
    "targetRetailPrice": number (retail price per portion),
    "grossMarginPct": number (e.g., 78.5),
    "instructions": ["step 1", "step 2", "step 3"],
    "prepTimeMinutes": number,
    "chefTips": "string",
    "allergens": ["string"],
    "createdAt": "${new Date().toISOString().split('T')[0]}"
  }
]`;

    const { text } = await generateContentWithFallback(prompt);
    const parsed = parseModelJson<unknown>(text);

    let rawList: any[] = [];
    if (Array.isArray(parsed)) {
      rawList = parsed;
    } else if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as Record<string, unknown>).recipes)
    ) {
      rawList = (parsed as Record<string, unknown>).recipes as any[];
    } else {
      return getMockRecipeFusion();
    }

    return rawList.map((r: any, idx: number) => ({
      ...r,
      id: r.id && typeof r.id === 'string' && !r.id.includes('string')
        ? r.id
        : `rec-gen-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`
    }));
  } catch (error) {
    console.error('Error in processRecipeFusion Gemini call:', error);
    return getMockRecipeFusion();
  }
}

// Fallback Mock Generators
function getMockOcrResult(): InvoiceOcrResult {
  return {
    vendorName: 'GAMBLES Produce Wholesalers',
    invoiceNumber: 'INV-2026-0707-GAMB',
    invoiceDate: '2026-07-07',
    totalAmount: 1759.00,
    departmentBreakdown: {
      PRODUCE: 1759.00,
      DAIRY: 0.00,
      BAKERY: 0.00,
      PANTRY: 0.00
    },
    lineItems: [
      { name: 'PEPPER-TX SERRANO 1/2 CTN', department: 'PRODUCE', quantity: 1, unit: 'cases', casePackSize: 40, subUnit: 'lbs', unitCost: 40.00, totalCost: 40.00 },
      { name: 'PINEAPPLE-CRI GOLD DOLE 7', department: 'PRODUCE', quantity: 5, unit: 'cases', casePackSize: 7, subUnit: 'units', unitCost: 23.00, totalCost: 115.00 },
      { name: 'POMEGRANATE-PER SZ 7 3.8KG', department: 'PRODUCE', quantity: 4, unit: 'cases', casePackSize: 4, subUnit: 'kg', unitCost: 28.00, totalCost: 112.00 },
      { name: 'POTATO-CAN FINGERLING 50LB', department: 'PRODUCE', quantity: 1, unit: 'cases', casePackSize: 50, subUnit: 'lbs', unitCost: 111.00, totalCost: 111.00 },
      { name: 'RADISH-QC BUNCH 24', department: 'PRODUCE', quantity: 2, unit: 'cases', casePackSize: 24, subUnit: 'bunches', unitCost: 28.00, totalCost: 56.00 },
      { name: 'RAPINI-CA ANDY BOY 26', department: 'PRODUCE', quantity: 1, unit: 'cases', casePackSize: 26, subUnit: 'bunches', unitCost: 62.00, totalCost: 62.00 },
      { name: 'SPINACH-CA BUNCH 24', department: 'PRODUCE', quantity: 1, unit: 'cases', casePackSize: 24, subUnit: 'bunches', unitCost: 29.00, totalCost: 29.00 },
      { name: 'SWISS CHARD-QC RED 24', department: 'PRODUCE', quantity: 1, unit: 'cases', casePackSize: 24, subUnit: 'bunches', unitCost: 38.00, totalCost: 38.00 },
      { name: 'TAMARIND-THA SWEET 20X500G', department: 'PRODUCE', quantity: 1, unit: 'cases', casePackSize: 10, subUnit: 'kg', unitCost: 128.00, totalCost: 128.00 },
      { name: 'TOMATILLO-MEX 35LB', department: 'PRODUCE', quantity: 1, unit: 'cases', casePackSize: 35, subUnit: 'lbs', unitCost: 55.00, totalCost: 55.00 }
    ],
    rawSummary: 'Extracted 10 Produce line items from GAMBLES vendor delivery receipt.'
  };
}

function getMockVoiceResult(spokenText?: string): VoiceLoggerResult {
  const text = spokenText || 'Logged 10 lbs bruised apples and 4L heavy cream';
  return {
    transcript: text,
    targetAction: 'KITCHEN_RESCUE',
    parsedItems: [
      {
        name: 'Bruised Honeycrisp Apples',
        quantity: 10,
        unit: 'lbs',
        department: 'PRODUCE',
        condition: 'Bruised',
        allergenWarnings: []
      },
      {
        name: 'Whole Heavy Cream 40%',
        quantity: 4,
        unit: 'Liters',
        department: 'DAIRY',
        condition: 'Near Expiry',
        allergenWarnings: ['Milk / Dairy']
      }
    ],
    kitchenRescueNotes: 'Spoken items flagged on floor. Transfer to kitchen prep station immediately for Parfait or Spiced Apple Bakery Soup.',
    estimatedWasteSavedValue: 42.80
  };
}

function getMockRecipeFusion(): RecipeFusionResult[] {
  const nonce = Date.now() + '-' + Math.floor(Math.random() * 1000);
  return [
    {
      id: `rec-mock-1-${nonce}`,
      recipeName: 'Spiced Apple & Sweet Cream Bakery Crisp',
      category: 'Parfait / Dessert',
      ingredientsUsed: [
        { name: 'Bruised Honeycrisp Apples', quantity: '10 lbs', department: 'PRODUCE', estimatedCost: 14.50 },
        { name: 'Heavy Cream 40%', quantity: '4 Liters', department: 'DAIRY', estimatedCost: 15.20 },
        { name: 'Artisanal Sourdough (Crumbs)', quantity: '4 loaves', department: 'BAKERY', estimatedCost: 8.40 }
      ],
      estimatedYield: '16 Individual Dessert Tubs (10 oz)',
      estimatedCost: 38.10,
      targetRetailPrice: 6.99,
      grossMarginPct: 65.9, 
      instructions: [
        'Peel, core, and dice bruised Honeycrisp apples.',
        'Sauté apples with brown sugar, butter, and cinnamon until tender.',
        'Whip heavy cream with vanilla bean extract until medium peaks form.',
        'Layer sautéed apples, whipped cream, and toasted sourdough streusel crumbs.',
        'Label with FreshLoop "Rescued Recipe - Chef Special" sticker and display in bakery deli case.'
      ],
      prepTimeMinutes: 20,
      chefTips: 'Utilizes short-dated dairy and bruised apples to yield $111.84 in retail sales from rescued ingredients.',
      allergens: ['Milk / Dairy', 'Wheat / Gluten'],
      createdAt: new Date().toISOString().split('T')[0]
    },
    {
      id: `rec-mock-2-${nonce}`,
      recipeName: 'Creamy Roasted Roma Tomato & Garlic Crouton Soup',
      category: 'Soup',
      ingredientsUsed: [
        { name: 'Ripe Roma Tomatoes', quantity: '20 lbs', department: 'PRODUCE', estimatedCost: 23.00 },
        { name: 'Heavy Cream 40%', quantity: '2 Liters', department: 'DAIRY', estimatedCost: 7.60 },
        { name: 'Sourdough Boule Croutons', quantity: '6 loaves', department: 'BAKERY', estimatedCost: 12.60 },
        { name: 'Olive Oil & Herbs', quantity: '250 ml', department: 'PANTRY', estimatedCost: 2.10 }
      ],
      estimatedYield: '24 Soup Deli Cups (16 oz)',
      estimatedCost: 45.30,
      targetRetailPrice: 7.49,
      grossMarginPct: 74.8,
      instructions: [
        'Roast overripe Roma tomatoes with garlic and olive oil at 400°F for 30 minutes.',
        'Puree in commercial blender with heavy cream and vegetable broth until silky.',
        'Season with sea salt, cracked black pepper, and fresh basil.',
        'Serve with crunchy roasted sourdough garlic croutons on top.'
      ],
      prepTimeMinutes: 35,
      chefTips: 'Transforms 20 lbs of soft tomatoes into high-demand housemade soup.',
      allergens: ['Milk / Dairy', 'Wheat / Gluten'],
      createdAt: new Date().toISOString().split('T')[0]
    }
  ];
}

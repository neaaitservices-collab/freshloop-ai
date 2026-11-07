import { RecipeFusionResult, InventoryItem } from '@/lib/types';
import { GEMINI_FLASH_MODEL_FALLBACKS } from '@/lib/domains/ai/geminiModels';

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
type GeminiSdkClient = {
  getGenerativeModel: (opts: {
    model: string;
    generationConfig: Record<string, unknown>;
  }) => {
    generateContent: (parts: GeminiContentPart[]) => Promise<{
      response: { text: () => string };
    }>;
  };
};

type GeminiContentPart =
  | { text: string }
  | { inlineData: { data: string; mimeType: string } };

function getGenAIClient(apiKey: string): { client: GeminiSdkClient } | null {
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

export type GenerateContentOptions = {
  /** Skip the models.list API round-trip (saves ~200–800ms on hot paths like invoice OCR). */
  skipModelDiscovery?: boolean;
  /** Cap how many models to attempt before failing. */
  maxModelsToTry?: number;
  /**
   * Use the generateContent REST endpoint first (skip SDK). Often lower latency for vision
   * and avoids paying for two sequential attempts when both are installed.
   */
  preferRestApi?: boolean;
  /** Merged into generationConfig (JSON mode, caps, temperature). */
  generationConfig?: Record<string, unknown>;
};

const MODEL_LIST_TTL_MS = 30 * 60 * 1000;
let cachedListedModels: { fetchedAt: number; names: string[] } | null = null;

async function discoverGenerativeModels(apiKey: string): Promise<string[]> {
  if (cachedListedModels && Date.now() - cachedListedModels.fetchedAt < MODEL_LIST_TTL_MS) {
    return cachedListedModels.names;
  }
  try {
    const listResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=100`
    );
    if (!listResponse.ok) return [];
    const listed = await listResponse.json();
    const names = (listed.models || [])
      .filter((model: { supportedGenerationMethods?: string[] }) =>
        model.supportedGenerationMethods?.includes('generateContent')
      )
      .map((model: { name?: string }) => String(model.name || '').replace(/^models\//, ''))
      .filter(Boolean);
    cachedListedModels = { fetchedAt: Date.now(), names };
    return names;
  } catch {
    return [];
  }
}

function rankFlashModels(names: string[]): string[] {
  return names.slice().sort((a, b) => {
    const score = (name: string) => {
      if (/gemini-3\.8-flash/.test(name)) return -3;
      if (/gemini-3[.-]\d+-flash/.test(name) && !/lite|image|tts|live/.test(name)) return -2;
      if (/flash/.test(name) && !/lite|image|tts|live/.test(name)) return 0;
      if (/flash/.test(name)) return 1;
      return 2;
    };
    return score(a) - score(b);
  });
}

/**
 * Direct REST API fallback supporting OAuth Bearer tokens (AQ.xxx) & API keys (AIzaSyxxx)
 */
function buildGenerationConfig(options?: GenerateContentOptions): Record<string, unknown> {
  return {
    responseMimeType: 'application/json',
    temperature: 0.1,
    maxOutputTokens: 8192,
    ...options?.generationConfig,
  };
}

async function tryGeminiRestGenerateContent(
  modelName: string,
  apiKey: string,
  promptText: string,
  inlinePart: { data: string; mimeType: string } | undefined,
  genConfig: Record<string, unknown>,
  remember: (model: string, detail: string) => void
): Promise<string | null> {
  const parts: GeminiContentPart[] = [{ text: promptText }];
  if (inlinePart) {
    parts.push({ inlineData: inlinePart });
  }
  const payload = JSON.stringify({
    contents: [{ parts }],
    generationConfig: genConfig,
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
          return responseText;
        }
        remember(modelName, `${attempt.label} returned no text`);
      } else {
        if (attempt.label === 'key' && (response.status === 401 || response.status === 403)) {
          keyUnauthorized = true;
        }
        remember(modelName, `${attempt.label} ${response.status} ${raw.slice(0, 180)}`);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'request failed';
      remember(modelName, `${attempt.label} ${message}`);
    }
  }
  return null;
}

function tryGeminiSdkGenerateContent(
  apiKey: string,
  modelName: string,
  promptText: string,
  inlinePart: { data: string; mimeType: string } | undefined,
  genConfig: Record<string, unknown>,
  remember: (model: string, detail: string) => void
): Promise<string | null> {
  const sdk = getGenAIClient(apiKey);
  if (!sdk) return Promise.resolve(null);
  return (async () => {
    try {
      const model = sdk.client.getGenerativeModel({
        model: modelName,
        generationConfig: genConfig,
      });
      const parts: GeminiContentPart[] = [{ text: promptText }];
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
      return text || null;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'SDK request failed';
      remember(modelName, message);
      return null;
    }
  })();
}

export async function generateContentWithFallback(
  promptText: string,
  inlinePart?: { data: string; mimeType: string },
  preferredModels: string[] = [...GEMINI_FLASH_MODEL_FALLBACKS],
  options?: GenerateContentOptions
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

  const genConfig = buildGenerationConfig(options);
  const preferRest = Boolean(options?.preferRestApi && inlinePart);

  const maxTry = options?.maxModelsToTry ?? 4;
  let modelsToTry: string[];

  if (options?.skipModelDiscovery) {
    modelsToTry = rankFlashModels(preferredModels).slice(0, maxTry);
  } else {
    const listedModels = await discoverGenerativeModels(apiKey);
    const ranked = rankFlashModels(listedModels.length ? listedModels : preferredModels).slice(
      0,
      maxTry
    );
    modelsToTry = ranked.length ? ranked : preferredModels.slice(0, maxTry);
  }

  for (const modelName of modelsToTry) {
    try {
      let text: string | null = null;

      if (preferRest) {
        text = await tryGeminiRestGenerateContent(
          modelName,
          apiKey,
          promptText,
          inlinePart,
          genConfig,
          remember
        );
        if (!text) {
          text = await tryGeminiSdkGenerateContent(
            apiKey,
            modelName,
            promptText,
            inlinePart,
            genConfig,
            remember
          );
        }
      } else {
        text = await tryGeminiSdkGenerateContent(
          apiKey,
          modelName,
          promptText,
          inlinePart,
          genConfig,
          remember
        );
        if (!text) {
          text = await tryGeminiRestGenerateContent(
            modelName,
            apiKey,
            promptText,
            inlinePart,
            genConfig,
            remember
          );
        }
      }

      if (text) {
        return { text, modelUsed: modelName };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'request failed';
      remember(modelName, message);
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
  const modelUnavailable =
    failures.length > 0 &&
    failures.every(
      (line) =>
        line.includes('404') ||
        line.includes('no longer available') ||
        line.includes('not found')
    );
  throw new Error(
    rejected
      ? 'The photo could not be read. The Gemini key on this store was rejected.'
      : modelUnavailable
        ? 'The vision model is unavailable on this API key. Set GEMINI_OCR_MODEL=gemini-3.8-flash and restart the dev server.'
        : failures[0] || 'The invoice reader could not reach the model.'
  );
}

function rejectProductionAiMock(feature: string): never {
  throw new Error(
    `${feature} is unavailable. Configure GEMINI_API_KEY or try again later.`
  );
}

/**
 * Cross-Department Recipe Fusion Engine using Gemini 1.5 Flash
 */
export async function processRecipeFusion(
  shortDatedItems: InventoryItem[],
  _targetCategory?: string
): Promise<RecipeFusionResult[]> {
  void _targetCategory;
  const apiKey = getApiKey();
  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      rejectProductionAiMock('Recipe fusion');
    }
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

    let rawList: unknown[] = [];
    if (Array.isArray(parsed)) {
      rawList = parsed;
    } else if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as Record<string, unknown>).recipes)
    ) {
      rawList = (parsed as Record<string, unknown>).recipes as unknown[];
    } else {
      if (process.env.NODE_ENV === 'production') {
        rejectProductionAiMock('Recipe fusion');
      }
      return getMockRecipeFusion();
    }

    return rawList.map((entry, idx) => {
      const r =
        entry && typeof entry === 'object'
          ? (entry as Record<string, unknown>)
          : ({} as Record<string, unknown>);
      const id = r.id;
      const recipeId =
        typeof id === 'string' && id.length > 0 && !id.includes('string')
          ? id
          : `rec-gen-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`;
      return { ...r, id: recipeId } as RecipeFusionResult;
    });
  } catch (error) {
    console.error('Error in processRecipeFusion Gemini call:', error);
    if (process.env.NODE_ENV === 'production') {
      rejectProductionAiMock('Recipe fusion');
    }
    return getMockRecipeFusion();
  }
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

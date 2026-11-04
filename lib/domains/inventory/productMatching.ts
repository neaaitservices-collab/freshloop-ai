/** Shared invoice / voice / receive matching against catalog product names. */

const STOP_WORDS = new Set([
  'and',
  'the',
  'per',
  'case',
  'cases',
  'ctn',
  'cnt',
  'pkg',
  'pack',
  'size',
  'product',
  'canada',
  'usa',
  'mex',
  'mexico',
  'ontario',
  'quebec',
  'organic',
  'fresh',
  'local',
  'no',
  'cri',
  'can',
  'tx',
  'tha',
  'qc',
  'of',
  'hot',
  'house',
  'tub',
  'tubs',
  'pint',
  'pints',
  'bunch',
  'bunches',
  'bag',
  'box',
  'each',
]);

/** Strip invoice noise; pack counts and origins live in item controls, not the match key. */
export function normalizeProductNameForMatch(raw: string): string {
  let value = raw.toLowerCase();
  value = value.replace(/[^a-z0-9\s/x.-]/g, ' ');
  value = value.replace(/\b\d+\s*x\s*\d+\s*(lb|lbs|kg|oz|g|ml|l|pt|pint|pints)?\b/gi, ' ');
  value = value.replace(/\b\d+(\.\d+)?\s*(lb|lbs|kg|oz|g|ml|l|pt|pints?|cs|case|cases)\b/gi, ' ');
  value = value.replace(/\b\d+(\.\d+)?(kg|lb|lbs|oz|g|ml|l)\b/gi, ' ');
  value = value.replace(/\b\d+\s*(ct|count|pk|pack)\b/gi, ' ');
  value = value.replace(/\b(product of|no\.?\s*\d+|canada|usa|mexico|ontario|quebec)\b/gi, ' ');
  value = value.replace(/\b\d{2,}\b/g, ' ');
  value = value.replace(/[-_/]+/g, ' ');
  value = value.replace(/\s+/g, ' ').trim();
  return value;
}

function stemToken(token: string): string {
  if (token.length <= 3) return token;
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith('es') && token.length > 4) return token.slice(0, -2);
  if (token.endsWith('s') && token.length > 4) return token.slice(0, -1);
  return token;
}

export function identityTokens(raw: string): string[] {
  const normalized = normalizeProductNameForMatch(raw);
  const rawTokens = normalized.split(' ').filter((token) => token.length >= 3);
  const stems = rawTokens
    .map(stemToken)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
  return [...new Set(stems)];
}

function compact(value: string): string {
  return normalizeProductNameForMatch(value).replace(/\s+/g, '');
}

function tokensOverlapExact(needle: string[], hay: Set<string>): number {
  let matched = 0;
  for (const token of needle) {
    if (hay.has(token)) matched += 1;
  }
  return matched;
}

/** Prefer human-readable catalog titles over ALL-CAPS invoice codes with embedded pack sizes. */
export function catalogNamePreference(name: string): number {
  let score = 0;
  if (/[a-z]/.test(name)) score += 12;
  if (name !== name.toUpperCase()) score += 6;
  score -= (name.match(/\d/g) ?? []).length * 2.5;
  score -= Math.max(0, name.length - 28) * 0.15;
  return score;
}

export function scoreProductMatch(itemName: string, productName: string): number {
  const needleCompact = compact(itemName);
  const hayCompact = compact(productName);
  if (needleCompact.length >= 4 && hayCompact.length >= 4 && needleCompact === hayCompact) {
    return 100;
  }

  const needleTokens = identityTokens(itemName);
  const hayTokens = identityTokens(productName);
  if (needleTokens.length === 0 || hayTokens.length === 0) return 0;

  const haySet = new Set(hayTokens);
  const needleSet = new Set(needleTokens);
  const forward = tokensOverlapExact(needleTokens, haySet) / needleTokens.length;
  const reverse = tokensOverlapExact(hayTokens, needleSet) / hayTokens.length;

  const primary = [...needleTokens].sort((a, b) => b.length - a.length)[0];
  if (primary && !haySet.has(primary)) {
    return 0;
  }

  let score = forward * 65 + reverse * 35;
  if (
    needleCompact.length > 5 &&
    hayCompact.length > 5 &&
    (needleCompact === hayCompact || needleCompact.includes(hayCompact) || hayCompact.includes(needleCompact))
  ) {
    score = Math.max(score, 82);
  }
  return Number(score.toFixed(2));
}

/** Stricter pairing for admin duplicate cleanup (avoids dill↔granadilla, granola↔lemons). */
export function catalogDuplicateScore(itemName: string, productName: string): number {
  const needleCompact = compact(itemName);
  const hayCompact = compact(productName);
  if (needleCompact.length >= 4 && needleCompact === hayCompact) return 100;

  const needleTokens = identityTokens(itemName);
  const hayTokens = identityTokens(productName);
  if (needleTokens.length === 0 || hayTokens.length === 0) return 0;

  const haySet = new Set(hayTokens);
  const shared = needleTokens.filter((t) => haySet.has(t));
  if (shared.length === 0) return 0;

  const smaller = needleTokens.length <= hayTokens.length ? needleTokens : hayTokens;
  const sharedAllSmaller = smaller.every((t) => shared.includes(t));
  if (!sharedAllSmaller) return 0;

  const multi =
    needleTokens.length >= hayTokens.length
      ? needleTokens
      : hayTokens;
  const head = [...multi].sort((a, b) => b.length - a.length)[0];
  if (!shared.includes(head)) return 0;

  if (shared.length < 2 && needleTokens.length > 1 && hayTokens.length > 1) {
    return 0;
  }

  const forward = shared.length / needleTokens.length;
  const reverse = shared.length / hayTokens.length;
  return Number((forward * 60 + reverse * 40).toFixed(2));
}

export function matchProduct<T extends { name: string }>(
  itemName: string,
  products: T[],
  options?: { minScore?: number }
): T | null {
  const minScore = options?.minScore ?? 52;
  const trimmed = itemName.trim();
  if (!trimmed) return null;

  let best: { product: T; score: number; pref: number } | null = null;

  for (const product of products) {
    const score = scoreProductMatch(trimmed, product.name);
    if (score < minScore) continue;
    const pref = catalogNamePreference(product.name);
    if (!best || score > best.score || (score === best.score && pref > best.pref)) {
      best = { product, score, pref };
    }
  }

  return best?.product ?? null;
}

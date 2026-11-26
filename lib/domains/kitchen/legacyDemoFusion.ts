/**
 * Demo fusion fingerprints and cleanup gating.
 * No Prisma client and no `server-only` import, so the cleanup script can
 * refuse before it opens a database.
 */

export type LegacyDemoFusionIngredient = {
  name: string;
  quantity: string;
  department: string;
  estimatedCost: number;
};

export type LegacyDemoFusionFingerprint = {
  recipeName: string;
  estimatedCost: number;
  ingredientsUsed: LegacyDemoFusionIngredient[];
};

/**
 * Cards the retired in-process generator saved.
 * The old create path dropped the `rec-mock-` id and Prisma assigned a uuid, so
 * the list matches the name, the batch cost, and the ingredient lines.
 */
export const LEGACY_DEMO_FUSION_FINGERPRINTS: readonly LegacyDemoFusionFingerprint[] = [
  {
    recipeName: 'Spiced Apple & Sweet Cream Bakery Crisp',
    estimatedCost: 38.1,
    ingredientsUsed: [
      { name: 'Bruised Honeycrisp Apples', quantity: '10 lbs', department: 'PRODUCE', estimatedCost: 14.5 },
      { name: 'Heavy Cream 40%', quantity: '4 Liters', department: 'DAIRY', estimatedCost: 15.2 },
      { name: 'Artisanal Sourdough (Crumbs)', quantity: '4 loaves', department: 'BAKERY', estimatedCost: 8.4 },
    ],
  },
  {
    recipeName: 'Creamy Roasted Roma Tomato & Garlic Crouton Soup',
    estimatedCost: 45.3,
    ingredientsUsed: [
      { name: 'Ripe Roma Tomatoes', quantity: '20 lbs', department: 'PRODUCE', estimatedCost: 23 },
      { name: 'Heavy Cream 40%', quantity: '2 Liters', department: 'DAIRY', estimatedCost: 7.6 },
      { name: 'Sourdough Boule Croutons', quantity: '6 loaves', department: 'BAKERY', estimatedCost: 12.6 },
      { name: 'Olive Oil & Herbs', quantity: '250 ml', department: 'PANTRY', estimatedCost: 2.1 },
    ],
  },
];

export function isLegacyDemoFusionRow(row: {
  recipeName: string;
  estimatedCost: number;
  ingredientsUsed: unknown;
}): boolean {
  return LEGACY_DEMO_FUSION_FINGERPRINTS.some(
    (demo) =>
      row.recipeName === demo.recipeName &&
      row.estimatedCost === demo.estimatedCost &&
      JSON.stringify(row.ingredientsUsed) === JSON.stringify(demo.ingredientsUsed)
  );
}

/** One fingerprint match. The list hides these rows; the cleanup script deletes them. */
export function legacyDemoFusionMatch(): Array<{
  recipeName: string;
  estimatedCost: number;
  ingredientsUsed: { equals: LegacyDemoFusionIngredient[] };
}> {
  return LEGACY_DEMO_FUSION_FINGERPRINTS.map((demo) => ({
    recipeName: demo.recipeName,
    estimatedCost: demo.estimatedCost,
    ingredientsUsed: { equals: demo.ingredientsUsed },
  }));
}

/** `npx tsx` does not set NODE_ENV, so the flag is required on every run. */
export function demoFusionCleanupMode(
  allowFlag: string | undefined,
  apply: boolean
): 'refuse' | 'count' | 'delete' {
  if (allowFlag !== '1') return 'refuse';
  return apply ? 'delete' : 'count';
}

/** Host, port, and database name. User, password, and the full URL stay out of the log. */
export function databaseTargetLabel(databaseUrl: string | undefined): {
  host: string;
  database: string;
} {
  const raw = databaseUrl?.trim();
  const unreadable = { host: '(unreadable DATABASE_URL)', database: '(unreadable DATABASE_URL)' };
  if (!raw) return { host: '(no DATABASE_URL)', database: '(no DATABASE_URL)' };
  try {
    const parsed = new URL(raw);
    if (raw.includes('@') && parsed.username === '') return unreadable;
    const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    return {
      host: parsed.host || '(no host)',
      database: database || '(no database)',
    };
  } catch {
    return unreadable;
  }
}

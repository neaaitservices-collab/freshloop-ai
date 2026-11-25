/**
 * Delete legacy demo RecipeFusion rows that were saved with database uuids.
 *
 * Matches the two retired generator cards by recipe name, batch cost, and
 * ingredient lines. Safe to run more than once: a second run deletes nothing.
 *
 * Not part of install, CI, or deploy. Do not run against production until
 * Nelson approves it. Production also requires FRESHLOOP_ALLOW_DEMO_FUSION_CLEANUP=1.
 *
 *   npx tsx scripts/cleanup-legacy-demo-fusion.ts
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/domains/inventory/ledger';
import { LEGACY_DEMO_FUSION_FINGERPRINTS } from '@/lib/domains/kitchen/recipeFusionStore';

const production = process.env.NODE_ENV === 'production';
if (production && process.env.FRESHLOOP_ALLOW_DEMO_FUSION_CLEANUP !== '1') {
  console.error(
    'Refusing to delete demo fusion rows in production. Nelson must approve this run. Set FRESHLOOP_ALLOW_DEMO_FUSION_CLEANUP=1 only after that approval.'
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const removed = await prisma.recipeFusion.deleteMany({
    where: {
      OR: LEGACY_DEMO_FUSION_FINGERPRINTS.map((demo) => ({
        recipeName: demo.recipeName,
        estimatedCost: demo.estimatedCost,
        ingredientsUsed: { equals: demo.ingredientsUsed as unknown as Prisma.InputJsonValue },
      })),
    },
  });
  console.log(`Deleted ${removed.count} legacy demo fusion row(s).`);
  await prisma.$disconnect();
}

main().catch(async (error: unknown) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});

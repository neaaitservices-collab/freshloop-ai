/**
 * List or delete legacy demo RecipeFusion rows that were saved with database uuids.
 *
 * Matches the two retired generator cards by recipe name, batch cost, and
 * ingredient lines. Safe to run more than once: a second --apply finds nothing.
 *
 * Not part of install, CI, or deploy. Every environment requires
 * FRESHLOOP_ALLOW_DEMO_FUSION_CLEANUP=1, including a dry run. Without --apply
 * the script lists id, name, and cost and deletes nothing. Any run against
 * production needs Nelson's explicit approval before that flag is set.
 *
 *   FRESHLOOP_ALLOW_DEMO_FUSION_CLEANUP=1 npx tsx scripts/cleanup-legacy-demo-fusion.ts
 *   FRESHLOOP_ALLOW_DEMO_FUSION_CLEANUP=1 npx tsx scripts/cleanup-legacy-demo-fusion.ts --apply
 */
import {
  databaseTargetLabel,
  demoFusionCleanupMode,
  legacyDemoFusionMatch,
} from '../lib/domains/kitchen/legacyDemoFusion';

const mode = demoFusionCleanupMode(
  process.env.FRESHLOOP_ALLOW_DEMO_FUSION_CLEANUP,
  process.argv.includes('--apply')
);

if (mode === 'refuse') {
  console.error(
    'Refusing to run. Set FRESHLOOP_ALLOW_DEMO_FUSION_CLEANUP=1 in every environment. A production database also needs Nelson\'s explicit approval before that flag is set.'
  );
  process.exit(1);
}

const where = { OR: legacyDemoFusionMatch() };
const target = databaseTargetLabel(process.env.DATABASE_URL);

async function main(): Promise<void> {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  console.log(`Target database host: ${target.host}`);
  console.log(`Target database name: ${target.database}`);
  try {
    const rows = await prisma.recipeFusion.findMany({
      where,
      select: { id: true, recipeName: true, estimatedCost: true },
      orderBy: { recipeName: 'asc' },
    });
    console.log(`Legacy demo fusion rows matched: ${rows.length}`);
    for (const row of rows) {
      console.log(`${row.id}\t${row.recipeName}\t${row.estimatedCost}`);
    }
    if (mode === 'count') {
      console.log('Dry run. Nothing was deleted. Pass --apply to delete.');
      return;
    }
    const removed = await prisma.recipeFusion.deleteMany({ where });
    console.log(`Deleted ${removed.count} legacy demo fusion row(s) on ${target.host}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

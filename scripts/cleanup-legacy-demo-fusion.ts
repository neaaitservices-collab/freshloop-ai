/**
 * Count or delete legacy demo RecipeFusion rows that were saved with database uuids.
 *
 * Matches the two retired generator cards by recipe name, batch cost, and
 * ingredient lines. Safe to run more than once.
 *
 * Not part of install, CI, or deploy. Every run requires
 * FRESHLOOP_ALLOW_DEMO_FUSION_CLEANUP=1, including a dry run. Without --apply
 * the script only counts. Any run against production needs Nelson's explicit
 * approval before that flag is set.
 *
 *   FRESHLOOP_ALLOW_DEMO_FUSION_CLEANUP=1 npx tsx scripts/cleanup-legacy-demo-fusion.ts
 *   FRESHLOOP_ALLOW_DEMO_FUSION_CLEANUP=1 npx tsx scripts/cleanup-legacy-demo-fusion.ts --apply
 */
import { prisma } from '@/lib/domains/inventory/ledger';
import {
  databaseHostLabel,
  demoFusionCleanupMode,
  legacyDemoFusionMatch,
} from '@/lib/domains/kitchen/recipeFusionStore';

const mode = demoFusionCleanupMode(
  process.env.FRESHLOOP_ALLOW_DEMO_FUSION_CLEANUP,
  process.argv.includes('--apply')
);

if (mode === 'refuse') {
  console.error(
    'Refusing to run. Set FRESHLOOP_ALLOW_DEMO_FUSION_CLEANUP=1 on every run. A production database also needs Nelson\'s explicit approval before that flag is set.'
  );
  process.exit(1);
}

const where = { OR: legacyDemoFusionMatch() };
const host = databaseHostLabel(process.env.DATABASE_URL);

async function main(): Promise<void> {
  const matched = await prisma.recipeFusion.count({ where });
  console.log(`Target database host: ${host}`);
  console.log(`Legacy demo fusion rows matched: ${matched}`);
  if (mode === 'count') {
    console.log('Dry run. Pass --apply to delete.');
    await prisma.$disconnect();
    return;
  }
  const removed = await prisma.recipeFusion.deleteMany({ where });
  console.log(`Deleted ${removed.count} legacy demo fusion row(s) on ${host}.`);
  await prisma.$disconnect();
}

main().catch(async (error: unknown) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});

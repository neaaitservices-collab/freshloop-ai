import { createRequire } from 'node:module';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';

type PrismaGlobal = {
  prismaClientFreshloop?: PrismaClient;
  prismaGenerationKey?: string;
  prismaClientArtifactMtime?: number;
  prismaClientV3?: PrismaClient;
};

const globalForPrisma = globalThis as unknown as PrismaGlobal;

const projectRoot = process.cwd();
const projectRequire = createRequire(join(projectRoot, 'package.json'));
const GENERATED_CLIENT_ENTRY = join(projectRoot, 'node_modules/.prisma/client/index.js');

function clearPrismaModuleCache(): void {
  for (const key of Object.keys(require.cache)) {
    if (
      key.includes(`${join('node_modules', '.prisma', 'client')}`) ||
      key.includes(`${join('node_modules', '@prisma', 'client')}`)
    ) {
      delete require.cache[key];
    }
  }
}

function loadPrismaModule(): typeof import('@prisma/client') {
  if (existsSync(GENERATED_CLIENT_ENTRY)) {
    const mtime = statSync(GENERATED_CLIENT_ENTRY).mtimeMs;
    if (globalForPrisma.prismaClientArtifactMtime !== mtime) {
      clearPrismaModuleCache();
      globalForPrisma.prismaClientArtifactMtime = mtime;
      delete globalForPrisma.prismaClientFreshloop;
      delete globalForPrisma.prismaGenerationKey;
    }
  }
  // Resolve from project root so Next/Turbopack never serves an inlined stale client.
  return projectRequire('@prisma/client') as typeof import('@prisma/client');
}

function prismaGenerationKey(): string {
  const { Prisma } = loadPrismaModule();
  const productFields = Object.keys(Prisma.ProductScalarFieldEnum).sort().join(',');
  const hasSupplier = 'Supplier' in Prisma.ModelName;
  const artifactMtime = existsSync(GENERATED_CLIENT_ENTRY)
    ? String(statSync(GENERATED_CLIENT_ENTRY).mtimeMs)
    : '0';
  return `${artifactMtime}|${productFields}|supplier:${hasSupplier}`;
}

function createPrismaClient(): PrismaClient {
  const { PrismaClient: PrismaClientCtor } = loadPrismaModule();
  return new PrismaClientCtor({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

function assertRequiredDelegates(client: PrismaClient): void {
  const withDelegates = client as unknown as { floorBundlePromo?: { findMany?: unknown } };
  if (typeof withDelegates.floorBundlePromo?.findMany !== 'function') {
    throw new Error(
      'Prisma client is out of date (missing FloorBundlePromo). Run: npm run db:generate — then restart the dev server.'
    );
  }
}

function getPrismaClient(): PrismaClient {
  delete globalForPrisma.prismaClientV3;

  const generationKey = prismaGenerationKey();
  if (
    globalForPrisma.prismaClientFreshloop &&
    globalForPrisma.prismaGenerationKey === generationKey
  ) {
    return globalForPrisma.prismaClientFreshloop;
  }

  const client = createPrismaClient();
  assertRequiredDelegates(client);
  globalForPrisma.prismaClientFreshloop = client;
  globalForPrisma.prismaGenerationKey = generationKey;
  return client;
}

/** Lazy proxy so dev HMR cannot keep a stale client missing newly generated models. */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    const value = Reflect.get(client as object, prop, client);
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(client)
      : value;
  },
});

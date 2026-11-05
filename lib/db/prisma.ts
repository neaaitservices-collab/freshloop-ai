import type { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prismaClientFreshloop?: PrismaClient;
  /** Legacy dev cache — drop so new models are picked up after generate. */
  prismaClientV3?: PrismaClient;
};

function loadPrismaClientClass(): typeof PrismaClient {
  // Runtime require so Next/Turbopack does not embed an outdated generated client.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@prisma/client').PrismaClient as typeof PrismaClient;
}

function clientHasCurrentModels(client: PrismaClient | undefined): client is PrismaClient {
  const record = client as unknown as {
    floorBundlePromo?: { findMany?: unknown };
  } | undefined;
  return typeof record?.floorBundlePromo?.findMany === 'function';
}

function createPrismaClient(): PrismaClient {
  const PrismaClientCtor = loadPrismaClientClass();
  return new PrismaClientCtor({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

function getPrismaClient(): PrismaClient {
  delete globalForPrisma.prismaClientV3;

  const cached = globalForPrisma.prismaClientFreshloop;
  if (clientHasCurrentModels(cached)) {
    return cached;
  }

  const client = createPrismaClient();
  if (!clientHasCurrentModels(client)) {
    throw new Error(
      'Prisma client is missing FloorBundlePromo. Run: npm run db:generate — then restart the dev server.'
    );
  }
  globalForPrisma.prismaClientFreshloop = client;
  return client;
}

/** Lazy proxy so dev HMR cannot keep a stale client missing newly generated models. */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    const value = Reflect.get(client as object, prop, client);
    if (typeof value === 'function') {
      return (value as (...args: unknown[]) => unknown).bind(client);
    }
    return value;
  },
});

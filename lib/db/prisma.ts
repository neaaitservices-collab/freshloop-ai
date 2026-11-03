import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prismaClientV3?: PrismaClient;
};

function clientHasCurrentModels(client: PrismaClient | undefined): client is PrismaClient {
  const record = client as unknown as {
    recipe?: unknown;
    user?: unknown;
    _runtimeDataModel?: {
      models?: {
        User?: {
          fields?: Array<{ name?: string }>;
        };
      };
    };
  } | undefined;
  if (!record?.recipe || !record?.user) return false;
  const userFields = record._runtimeDataModel?.models?.User?.fields;
  if (Array.isArray(userFields)) {
    return userFields.some((f) => f.name === 'hourlyRate');
  }
  return true;
}

export const prisma: PrismaClient = clientHasCurrentModels(globalForPrisma.prismaClientV3)
  ? globalForPrisma.prismaClientV3
  : new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });

globalForPrisma.prismaClientV3 = prisma;

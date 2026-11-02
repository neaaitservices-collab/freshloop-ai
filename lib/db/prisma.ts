import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prismaClientV2?: PrismaClient;
};

function clientHasCurrentModels(client: PrismaClient | undefined): client is PrismaClient {
  const record = client as unknown as Record<string, unknown> | undefined;
  return Boolean(record?.recipe && record?.user);
}

export const prisma: PrismaClient = clientHasCurrentModels(globalForPrisma.prismaClientV2)
  ? globalForPrisma.prismaClientV2
  : new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });

globalForPrisma.prismaClientV2 = prisma;

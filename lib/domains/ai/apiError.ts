import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AuthError } from '@/lib/auth/session';
import { InvalidJsonBodyError } from '@/lib/security/parseJsonBody';
import { InventoryLedgerError } from '@/lib/domains/inventory/ledger';
import {
  SalePayloadConflictError,
  SaleReplayUnavailableError,
} from '@/lib/domains/inventory/saleIdempotency';

export type ApiErrorLogContext = Record<string, unknown> & {
  actorId?: string;
  path?: string;
  route?: string;
  productId?: string;
  referenceId?: string;
};

export function errorMessage(error: unknown, fallback = 'Unexpected server error.'): string {
  return error instanceof Error ? error.message : fallback;
}

export function apiError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message, message }, { status });
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { value: error };
}

/** Log full error server-side; never send stack or Prisma internals to clients. */
export function logServerError(
  scope: string,
  error: unknown,
  context?: ApiErrorLogContext
): void {
  const envelope = {
    ts: new Date().toISOString(),
    scope,
    route: context?.route ?? context?.path ?? scope,
    ...context,
    error: serializeError(error),
  };
  console.error(JSON.stringify(envelope));
}

/** Standard catch helper for Route Handlers. */
export function handleApiRouteError(
  scope: string,
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
  context?: ApiErrorLogContext
) {
  logServerError(scope, error, {
    route: scope,
    ...context,
  });
  return apiErrorFromUnknown(error, fallback, context);
}

function zodErrorMessage(error: ZodError): string {
  const first = error.errors[0];
  if (!first) return 'Invalid request payload.';
  const path = first.path.length ? first.path.join('.') : 'body';
  return `${path}: ${first.message}`;
}

function isClientSafeMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('not found') ||
    lower.includes('required') ||
    lower.includes('must be') ||
    lower.includes('invalid') ||
    lower.includes('forbidden') ||
    lower.includes('unauthorized') ||
    lower.includes('insufficient') ||
    lower.includes('nothing is on the retail floor') ||
    lower.includes('greater than zero') ||
    lower.includes('already exists') ||
    lower.includes('too many requests') ||
    lower.includes('below cost') ||
    lower.includes('bundle promo') ||
    lower.includes('bundle calculator') ||
    lower.includes('store manager can use set bundles') ||
    lower.includes('migrate deploy') ||
    lower.includes('floor_bundle_promos') ||
    lower.includes('db:generate')
  );
}

export function prismaSetupHint(error: unknown): string | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;
  if (error.code === 'P2021') {
    return 'Set bundles storage is not on this database yet. Run: npx prisma migrate deploy';
  }
  return null;
}

export function apiErrorFromUnknown(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
  context?: ApiErrorLogContext
) {
  if (error instanceof AuthError) {
    return apiError(error.message, error.status);
  }
  if (error instanceof InvalidJsonBodyError) {
    return apiError(error.message, 400);
  }
  if (error instanceof ZodError) {
    return apiError(zodErrorMessage(error), 400);
  }
  if (error instanceof SalePayloadConflictError || error instanceof SaleReplayUnavailableError) {
    return apiError(error.message, error.statusCode);
  }
  if (error instanceof InventoryLedgerError) {
    logServerError('inventory-ledger', error, {
      route: context?.route,
      path: context?.path,
      actorId: context?.actorId,
      productId: context?.productId,
      referenceId: context?.referenceId,
    });
    return apiError(error.message, error.statusCode);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    logServerError('prisma', error, {
      route: context?.route,
      path: context?.path,
      actorId: context?.actorId,
      prismaCode: error.code,
      meta: error.meta,
    });
    const setupHint = prismaSetupHint(error);
    if (setupHint) return apiError(setupHint, 503);
    if (error.code === 'P2002') {
      return apiError('A record with that value already exists.', 409);
    }
    if (error.code === 'P2025') {
      return apiError('The requested record was not found.', 404);
    }
    return apiError(fallback, 500);
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    logServerError('prisma-init', error, context);
    return apiError(fallback, 503);
  }
  if (error instanceof Prisma.PrismaClientValidationError) {
    logServerError('prisma-validation', error, context);
    return apiError('Invalid data for this operation.', 400);
  }

  if (error instanceof Error) {
    const message = error.message;
    const status =
      message.includes('not found') ||
      message.includes('Nothing is on the retail floor') ||
      message.includes('must be greater than zero') ||
      message.includes('Insufficient')
        ? 400
        : 500;
    if (status >= 500) {
      logServerError('api', error, context);
      if (isClientSafeMessage(message)) {
        return apiError(message, 500);
      }
      return apiError(fallback, 500);
    }
    if (isClientSafeMessage(message)) {
      return apiError(message, status);
    }
    return apiError(fallback, status);
  }

  logServerError('api-unknown', error, context);
  return apiError(fallback, 500);
}

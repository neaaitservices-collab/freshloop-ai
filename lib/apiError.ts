import { NextResponse } from 'next/server';
import { InventoryLedgerError } from '@/lib/inventory';

export function errorMessage(error: unknown, fallback = 'Unexpected server error.'): string {
  return error instanceof Error ? error.message : fallback;
}

export function apiError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export function apiErrorFromUnknown(error: unknown, fallback?: string) {
  if (error instanceof InventoryLedgerError) {
    return apiError(error.message, error.statusCode);
  }
  const message = errorMessage(error, fallback);
  const status =
    message.includes('not found') ||
    message.includes('Nothing is on the retail floor') ||
    message.includes('must be greater than zero')
      ? 400
      : 500;
  return apiError(message, status);
}

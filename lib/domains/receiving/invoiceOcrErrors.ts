import { apiError } from '@/lib/domains/ai/apiError';
import type { NextResponse } from 'next/server';

/** Map known invoice OCR failures to actionable client messages (avoid generic 500 text). */
export function invoiceOcrErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof Error)) return null;
  const msg = error.message;

  if (/GEMINI_API_KEY missing/i.test(msg)) {
    return apiError(
      'Invoice scanning is not configured on this deployment. Add GEMINI_API_KEY in Vercel (see docs/DEPLOYMENT.md).',
      503
    );
  }

  if (/Gemini key on this store was rejected/i.test(msg)) {
    return apiError(
      'The Gemini API key for this store was rejected. Update GEMINI_API_KEY in Vercel and redeploy.',
      503
    );
  }

  if (/invoice reader could not reach the model/i.test(msg)) {
    return apiError(
      'Could not reach Google Gemini to read the invoice. Try again shortly, or use “Use a sample invoice” to verify receiving.',
      502
    );
  }

  if (/could not be parsed as structured JSON/i.test(msg)) {
    return apiError(msg, 422);
  }

  if (/Could not prepare the photo/i.test(msg)) {
    return apiError(msg, 400);
  }

  if (/invoice reader timed out/i.test(msg)) {
    return apiError(msg, 504);
  }

  return null;
}

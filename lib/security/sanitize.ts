/** Strip control characters and bound length for plain-text fields (XSS/injection hardening). */
export function sanitizePlainText(input: string, maxLen = 500): string {
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLen);
}

export function sanitizeOptionalPlainText(
  input: unknown,
  maxLen = 500
): string | undefined {
  if (typeof input !== 'string') return undefined;
  const cleaned = sanitizePlainText(input, maxLen);
  return cleaned.length > 0 ? cleaned : undefined;
}

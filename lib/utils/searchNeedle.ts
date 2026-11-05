/** Safe case-insensitive substring match for nullable catalog/search fields. */
export function fieldMatchesNeedle(
  value: string | null | undefined,
  needle: string
): boolean {
  if (!needle) return true;
  const hay = value?.trim()?.toLowerCase();
  return hay ? hay.includes(needle) : false;
}

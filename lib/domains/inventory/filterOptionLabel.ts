/** "All" option for a filter whose label is a singular noun ("Category" → "All categories"). */
export function allFilterOptionLabel(label: string): string {
  const lower = label.toLowerCase();
  const beforeY = lower[lower.length - 2] ?? '';
  if (lower.endsWith('y') && lower.length > 1 && !'aeiou'.includes(beforeY)) {
    return `All ${lower.slice(0, -1)}ies`;
  }
  return `All ${lower}s`;
}

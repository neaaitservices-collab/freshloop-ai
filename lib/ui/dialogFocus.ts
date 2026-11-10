/** Next index in a basic Tab cycle. `current` is -1 when focus is outside the list. */
export function nextFocusIndex(count: number, current: number, shift: boolean): number {
  if (count <= 0) return -1;
  if (shift) return current <= 0 ? count - 1 : current - 1;
  if (current < 0 || current >= count - 1) return 0;
  return current + 1;
}

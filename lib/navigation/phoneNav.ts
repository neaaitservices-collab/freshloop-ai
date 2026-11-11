/** Phone bar shows this many destinations. The rest open in More. */
export const PHONE_NAV_BAR_COUNT = 5;

/**
 * Column classes for the phone tab bar.
 * Five and six tabs wrap onto two rows so full labels fit at 390px
 * without a horizontal scroller. Fewer tabs stay on one row.
 */
export function phoneBarGridClass(count: number): string {
  if (count <= 1) return 'grid-cols-1';
  if (count === 2) return 'grid-cols-2';
  if (count === 3) return 'grid-cols-3';
  if (count === 4) return 'grid-cols-2 min-[34rem]:grid-cols-4';
  if (count === 5) return 'grid-cols-3 min-[34rem]:grid-cols-5';
  return 'grid-cols-3 min-[34rem]:grid-cols-6';
}

/** Voice without a handler would leave an empty phone-nav cell. */
export function visiblePhoneNavItems<T extends { voice?: boolean }>(
  items: readonly T[],
  hasVoiceHandler: boolean
): T[] {
  if (hasVoiceHandler) return [...items];
  return items.filter((item) => !item.voice);
}

export function splitPhoneNav<T>(items: readonly T[]): { bar: T[]; more: T[] } {
  if (items.length <= PHONE_NAV_BAR_COUNT) {
    return { bar: [...items], more: [] };
  }
  return {
    bar: items.slice(0, PHONE_NAV_BAR_COUNT),
    more: items.slice(PHONE_NAV_BAR_COUNT),
  };
}

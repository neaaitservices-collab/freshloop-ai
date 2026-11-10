/** Phone bar shows this many destinations. The rest open in More. */
export const PHONE_NAV_BAR_COUNT = 5;

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

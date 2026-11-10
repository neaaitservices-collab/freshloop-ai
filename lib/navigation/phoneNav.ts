/** Phone bar shows this many destinations. The rest open in More. */
export const PHONE_NAV_BAR_COUNT = 5;

export function splitPhoneNav<T>(items: readonly T[]): { bar: T[]; more: T[] } {
  if (items.length <= PHONE_NAV_BAR_COUNT) {
    return { bar: [...items], more: [] };
  }
  return {
    bar: items.slice(0, PHONE_NAV_BAR_COUNT),
    more: items.slice(PHONE_NAV_BAR_COUNT),
  };
}

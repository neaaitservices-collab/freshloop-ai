/** Phone bar destinations, in the order the admin phone shows them. */
export const PHONE_BAR_IDS = ['account', 'receive', 'inventory', 'production', 'voice'] as const;

export type PhoneBarId = (typeof PHONE_BAR_IDS)[number];

/**
 * Destinations that used to sit on the phone bar or under More, and where they live now.
 * Suppliers is an Admin tab. Orders was the only item that lived only under More.
 */
export const PHONE_NAV_HOMES = {
  suppliers: '/admin/suppliers',
  orders: '/admin/settings#orders',
} as const;

/** Voice without a handler would leave an empty phone-nav cell. */
export function visiblePhoneNavItems<T extends { voice?: boolean }>(
  items: readonly T[],
  hasVoiceHandler: boolean
): T[] {
  if (hasVoiceHandler) return [...items];
  return items.filter((item) => !item.voice);
}

/** The five phone destinations the role is allowed to open. No overflow menu. */
export function phoneBarItems<T extends { id: string; voice?: boolean }>(
  items: readonly T[],
  hasVoiceHandler: boolean
): T[] {
  const visible = visiblePhoneNavItems(items, hasVoiceHandler);
  const byId = new Map(visible.map((item) => [item.id, item]));
  return PHONE_BAR_IDS.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
}

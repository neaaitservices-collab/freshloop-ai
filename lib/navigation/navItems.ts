import { VOICE_UI_ENABLED } from '@/lib/features/voiceUiEnabled';
import { canVisit, isManager, type RoleName } from '@/lib/utils/roles';

export interface NavItem {
  id: string;
  label: string;
  href?: string;
  voice?: boolean;
  roles: RoleName[];
}

const NAV_ITEMS: NavItem[] = [
  { id: 'receive', label: 'Receive', href: '/receive', roles: ['ADMIN', 'STORE_MANAGER', 'RECEIVING_CLERK'] },
  {
    id: 'suppliers',
    label: 'Suppliers',
    href: '/admin/suppliers',
    roles: ['ADMIN', 'STORE_MANAGER', 'RECEIVING_CLERK'],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    href: '/inventory',
    roles: ['ADMIN', 'STORE_MANAGER', 'RECEIVING_CLERK', 'FLOOR_STAFF', 'DELI_CHEF'],
  },
  ...(VOICE_UI_ENABLED
    ? [
        {
          id: 'voice',
          label: 'Voice',
          voice: true,
          roles: ['ADMIN', 'STORE_MANAGER', 'FLOOR_STAFF'] as RoleName[],
        },
      ]
    : []),
  { id: 'production', label: 'Production', href: '/production', roles: ['ADMIN', 'STORE_MANAGER', 'DELI_CHEF'] },
  {
    id: 'operations',
    label: 'Operations',
    href: '/operations',
    roles: ['ADMIN', 'STORE_MANAGER'],
  },
  { id: 'orders', label: 'Orders', href: '/orders', roles: ['ADMIN', 'STORE_MANAGER'] },
  {
    id: 'account',
    label: 'Admin',
    href: '/admin',
    roles: ['ADMIN', 'STORE_MANAGER', 'RECEIVING_CLERK', 'FLOOR_STAFF', 'DELI_CHEF'],
  },
];

/** Role-specific label and address. Href changes happen before the canVisit filter. */
export function presentNavItem(item: NavItem, role: RoleName | null): NavItem {
  if (item.id === 'account' && role && !isManager(role)) {
    return { ...item, label: 'Profile', href: '/profile' };
  }
  if (item.id === 'inventory' && role === 'FLOOR_STAFF') {
    return { ...item, label: 'Floor', href: '/inventory/floor' };
  }
  if (item.id === 'inventory' && role === 'RECEIVING_CLERK') {
    return { ...item, label: 'Stock', href: '/inventory' };
  }
  return item;
}

/**
 * Nav entries for a role. Links are kept only when canVisit allows the href the user would open.
 * Voice has no route, so it stays when the role list includes it.
 */
export function navItemsForRole(role: RoleName | null): NavItem[] {
  const visible = !role
    ? NAV_ITEMS.filter((item) => item.roles.includes('ADMIN'))
    : NAV_ITEMS.filter((item) => item.roles.includes(role));
  const filtered =
    role && isManager(role) ? visible.filter((item) => item.id !== 'inventory') : visible;
  const presented = filtered.map((item) => presentNavItem(item, role));
  const permitted = role
    ? presented.filter((item) => !item.href || canVisit(role, item.href))
    : presented;
  if (!role || isManager(role)) {
    return [...permitted].sort((a, b) => Number(b.id === 'account') - Number(a.id === 'account'));
  }
  return permitted;
}

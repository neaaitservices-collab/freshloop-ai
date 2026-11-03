import type { RoleName } from '@/lib/utils/roles';

/** A store job. Choosing it is what grants platform access. */
export interface StaffPosition {
  label: string;
  role: RoleName;
  /** Plain-language access that follows this position. */
  access: string;
}

export const STAFF_POSITIONS: readonly StaffPosition[] = [
  {
    label: 'Owner',
    role: 'ADMIN',
    access: 'Full platform: staff, orders, operations, receive, inventory, production, and voice.',
  },
  {
    label: 'Store manager',
    role: 'STORE_MANAGER',
    access: 'Run the store: staff, orders, operations, receive, inventory, production, and voice.',
  },
  {
    label: 'Back door',
    role: 'RECEIVING_CLERK',
    access: 'Receive deliveries and update stock.',
  },
  {
    label: 'Produce floor',
    role: 'FLOOR_STAFF',
    access: 'Floor inventory and the voice log.',
  },
  {
    label: 'Deli production',
    role: 'DELI_CHEF',
    access: 'Production floor and inventory.',
  },
];

export function positionByLabel(label: string): StaffPosition | undefined {
  const normalized = label.trim().toLowerCase();
  return STAFF_POSITIONS.find((position) => position.label.toLowerCase() === normalized);
}

export function positionForRole(role: RoleName): StaffPosition {
  return STAFF_POSITIONS.find((position) => position.role === role) ?? STAFF_POSITIONS[3];
}

/** Catalog position for a person, including older free-text titles that still have a role. */
export function positionForStaff(position: string, role: RoleName): StaffPosition {
  return positionByLabel(position) ?? positionForRole(role);
}

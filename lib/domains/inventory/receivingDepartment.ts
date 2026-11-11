/** Departments a receiving clerk can assign. Matches the existing Department enum. */
export const RECEIVING_DEPARTMENTS = [
  'PRODUCE',
  'DAIRY',
  'BAKERY',
  'PANTRY',
  'DELI_KITCHEN',
] as const;

export type ReceivingDepartment = (typeof RECEIVING_DEPARTMENTS)[number];

export const RECEIVING_DEPARTMENT_REQUIRED =
  'Pick a department for this new item before receiving it.';

const RULES: { department: ReceivingDepartment; pattern: RegExp }[] = [
  { department: 'DAIRY', pattern: /dairy|cream|yogurt|yoghurt|milk|cheese|butter|kefir/ },
  { department: 'BAKERY', pattern: /bakery|bread|sourdough|loaf|baguette|pastry|croissant|muffin|bagel/ },
  { department: 'PANTRY', pattern: /pantry|vinegar|flour|sugar|rice|pasta|bean|canned|spice|cereal|\boil\b/ },
  {
    department: 'DELI_KITCHEN',
    pattern: /deli|kitchen|prepared|rotisserie|hummus|guacamole|sandwich|cold\s*cut/,
  },
  {
    department: 'PRODUCE',
    pattern:
      /produce|apple|banana|lemon|lime|pear|tomato|lettuce|onion|pepper|avocado|herb|cilantro|berr|grape|carrot|potato|fruit|vegetable|greens/,
  },
];

export function receivingDepartment(value: unknown): ReceivingDepartment | null {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase();
  return (RECEIVING_DEPARTMENTS as readonly string[]).includes(upper)
    ? (upper as ReceivingDepartment)
    : null;
}

function fromText(value: string | null | undefined): ReceivingDepartment | null {
  const text = value?.trim().toLowerCase() ?? '';
  if (!text) return null;
  for (const rule of RULES) {
    if (rule.pattern.test(text)) return rule.department;
  }
  return null;
}

/**
 * Invoice-line or per-line department wins, then supplier and category, then the item name.
 * A receive-screen department is used only when those signals are silent.
 * An assumed department (the old unread-line placeholder) is not a choice.
 */
export function resolveReceivingDepartment(input: {
  itemName: string;
  explicitDepartment?: string | null;
  departmentAssumed?: boolean;
  supplier?: string | null;
  category?: string | null;
  screenDepartment?: string | null;
}): ReceivingDepartment | null {
  if (input.departmentAssumed !== true) {
    const explicit = receivingDepartment(input.explicitDepartment);
    if (explicit) return explicit;
  }
  const fromSupplier = fromText(input.supplier) ?? fromText(input.category);
  if (fromSupplier) return fromSupplier;
  const fromName = fromText(input.itemName);
  if (fromName) return fromName;
  return receivingDepartment(input.screenDepartment);
}

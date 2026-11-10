const UNIT_WORDS: Record<string, readonly [string, string]> = {
  KG: ['kg', 'kg'],
  LBS: ['lb', 'lbs'],
  LITER: ['liter', 'liters'],
  ML: ['ml', 'ml'],
  UNIT: ['unit', 'units'],
  BUNCH: ['bunch', 'bunches'],
  LOAF: ['loaf', 'loaves'],
  TUB: ['tub', 'tubs'],
  CASE: ['case', 'cases'],
};

/** Plain footer label, e.g. Make 20 tubs. */
export function batchActionLabel(qty: number, unit: string): string {
  const pair = UNIT_WORDS[unit.trim().toUpperCase()];
  const word = pair ? (qty === 1 ? pair[0] : pair[1]) : unit.trim().toLowerCase();
  return `Make ${qty} ${word}`;
}

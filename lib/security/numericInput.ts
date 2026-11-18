import { z, type ZodNumber } from 'zod';

const NUMERIC_STRING = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

function normalizeNumericInput(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  if (!NUMERIC_STRING.test(trimmed)) return trimmed;
  return Number(trimmed);
}

/**
 * Trim a numeric input. Blank or whitespace becomes undefined, then `rules`
 * (a `z.number().finite()` schema with the field's min, max, and int checks) runs.
 *
 * Put `.optional()` or `.default()` outside this helper. An omitted value stays
 * missing. A present "" or " " fails, because the blank is undefined inside the
 * number schema and `z.number()` rejects it. NaN, Infinity, and strings such as
 * "abc" fail. Do not use `z.coerce.number()` for these fields.
 */
export function numericInput<T extends ZodNumber>(rules: T) {
  return z.preprocess(normalizeNumericInput, rules);
}

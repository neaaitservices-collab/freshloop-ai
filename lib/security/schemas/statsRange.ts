import { z } from 'zod';
import { calendarDaysInclusive, isValidYmd } from '@/lib/domains/stats/storeTime';

export const STATS_RANGE_MAX_DAYS = 366;

export const statsRangeQuerySchema = z
  .object({
    preset: z.enum(['day', 'week', 'month']).optional(),
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD.')
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD.')
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasPreset = Boolean(value.preset);
    const hasFrom = Boolean(value.from);
    const hasTo = Boolean(value.to);
    if (hasPreset && (hasFrom || hasTo)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Use either preset or from/to, not both.',
        path: ['preset'],
      });
      return;
    }
    if (hasFrom !== hasTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'from and to are both required.',
        path: [hasFrom ? 'to' : 'from'],
      });
      return;
    }
    if (!hasFrom || !value.from || !value.to) return;
    if (!isValidYmd(value.from) || !isValidYmd(value.to)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Use a real calendar date.',
        path: ['from'],
      });
      return;
    }
    if (value.from > value.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'from must be on or before to.',
        path: ['from'],
      });
      return;
    }
    if (calendarDaysInclusive(value.from, value.to) > STATS_RANGE_MAX_DAYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Date range must be 366 days or fewer.',
        path: ['to'],
      });
    }
  });

export type StatsRangeQuery = z.infer<typeof statsRangeQuerySchema>;

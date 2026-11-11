import type { TimelineKind } from '@/lib/domains/suppliers/supplierActivityModel';

export type TimelineCursor = {
  at: string;
  kind: TimelineKind;
  id: string;
};

const KIND_RANK: Record<TimelineKind, number> = {
  activity: 2,
  priceVariance: 1,
  quality: 0,
};

export function kindRank(kind: TimelineKind): number {
  return KIND_RANK[kind];
}

export function encodeCursor(cursor: TimelineCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(value: string | null | undefined): TimelineCursor | null | 'invalid' {
  if (value == null || value === '') return null;
  if (value.length > 512) return 'invalid';
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<TimelineCursor>;
    if (!parsed || typeof parsed.at !== 'string' || typeof parsed.id !== 'string') return 'invalid';
    if (parsed.kind !== 'activity' && parsed.kind !== 'priceVariance' && parsed.kind !== 'quality') {
      return 'invalid';
    }
    if (!parsed.id || parsed.id.length > 128) return 'invalid';
    const time = new Date(parsed.at);
    if (Number.isNaN(time.getTime())) return 'invalid';
    return { at: time.toISOString(), kind: parsed.kind, id: parsed.id };
  } catch {
    return 'invalid';
  }
}

/** True when a row sorts strictly after the cursor (older than the last item shown). */
export function isStrictlyOlder(
  row: { createdAt: Date; id: string; kind: TimelineKind },
  cursor: TimelineCursor | null
): boolean {
  if (!cursor) return true;
  const at = new Date(cursor.at).getTime();
  const rowAt = row.createdAt.getTime();
  if (rowAt < at) return true;
  if (rowAt > at) return false;
  const rank = KIND_RANK[row.kind];
  const cursorRank = KIND_RANK[cursor.kind];
  if (rank < cursorRank) return true;
  if (rank > cursorRank) return false;
  return row.id < cursor.id;
}

export function compareTimeline(
  a: { createdAt: string; kind: TimelineKind; id: string },
  b: { createdAt: string; kind: TimelineKind; id: string }
): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  const rank = KIND_RANK[b.kind] - KIND_RANK[a.kind];
  if (rank !== 0) return rank;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

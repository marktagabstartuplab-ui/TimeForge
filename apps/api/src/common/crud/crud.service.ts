import { ConflictException } from '@nestjs/common';

export interface ListQuery {
  limit?: string | number;
  cursor?: string;
  q?: string;
  [key: string]: unknown;
}

export interface PageMeta {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

export interface PageResult<T> {
  data: T[];
  page: PageMeta;
}

export function encodeCursor(id: string): string {
  return Buffer.from(JSON.stringify({ id })).toString('base64url');
}

export function decodeCursor(cursor: string): string {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { id?: string };
    if (!parsed.id) throw new Error('bad cursor');
    return parsed.id;
  } catch {
    throw new ConflictException('Invalid pagination cursor');
  }
}

/** Builds the standard `{ data, page }` response shape. Fetches `limit + 1` rows; trims and signals hasMore. */
export function buildPage<T extends { id: string }>(
  items: T[],
  limit: number,
): PageResult<T> {
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const lastItem = data[data.length - 1];
  return {
    data,
    page: {
      limit,
      hasMore,
      nextCursor: hasMore && lastItem ? encodeCursor(lastItem.id) : null,
    },
  };
}

import { logDbError, toUserMessage } from "@/lib/errors";

// Complete, verified reads for financial data.
//
// PostgREST silently truncates a response at the project's `max_rows` setting
// (Supabase default: 1000). Exports, backups and analytics must never treat a
// truncated response as the full ledger, so every multi-row read goes through
// `fetchAllPages`, which pages with `.range()` and checks the result against an
// exact count. Any mismatch fails closed with `IncompleteDataError`.

/** Rows requested per page. Kept below Supabase's default max_rows (1000). */
export const PAGE_SIZE = 500;
/** IDs per `.in()` filter. ~100 UUIDs keep the GET URL around 4 KB. */
export const ID_CHUNK_SIZE = 100;
/** Hard upper bound against runaway loops (500 × 400 = 200k rows). */
const MAX_PAGES = 400;

export class IncompleteDataError extends Error {
  constructor(label: string, detail: string) {
    super(`${label}讀取不完整（${detail}）。為避免產生不完整的財務資料，已停止此操作，請重新整理後再試。`);
    this.name = "IncompleteDataError";
  }
}

type QueryError = { message: string; code?: string | null } | null;
export type PageResponse<T> = { data: T[] | null; error: QueryError; count?: number | null };

/**
 * Fetches every row of a query in pages.
 * `fetchPage(from, to, withCount)` must apply a deterministic order that ends
 * with a unique column (e.g. `.order("id")`) so page boundaries are stable.
 */
export async function fetchAllPages<T>(
  label: string,
  fetchPage: (from: number, to: number, withCount: boolean) => PromiseLike<PageResponse<T>>,
  options: { pageSize?: number; getId?: (row: T) => string } = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const rows: T[] = [];
  let expected: number | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = rows.length;
    const response = await fetchPage(from, from + pageSize - 1, page === 0);
    if (response.error) {
      logDbError(`read ${label}`, response.error);
      throw new Error(`無法讀取${label}：${toUserMessage(response.error)}`);
    }
    if (page === 0) expected = typeof response.count === "number" ? response.count : null;
    const batch = response.data ?? [];
    rows.push(...batch);
    if (batch.length === 0) break;
    if (expected !== null && rows.length >= expected) break;
    // Without an exact count, a short page is the only end signal.
    if (expected === null && batch.length < pageSize) break;
  }
  if (expected !== null && rows.length !== expected) {
    throw new IncompleteDataError(label, `預期 ${expected} 筆，實際取得 ${rows.length} 筆`);
  }
  if (expected === null && rows.length >= pageSize * MAX_PAGES) {
    throw new IncompleteDataError(label, "超過安全讀取上限");
  }
  if (options.getId) {
    const seen = new Set<string>();
    for (const row of rows) {
      const id = options.getId(row);
      if (seen.has(id)) throw new IncompleteDataError(label, "讀取期間資料有變動");
      seen.add(id);
    }
  }
  return rows;
}

export function chunk<T>(values: readonly T[], size = ID_CHUNK_SIZE): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

/** Runs `fetchAllPages` for each ID chunk sequentially and concatenates the rows. */
export async function fetchAllByIdChunks<T>(
  ids: readonly string[],
  fetchChunk: (chunkIds: string[]) => Promise<T[]>,
  size = ID_CHUNK_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  for (const part of chunk([...new Set(ids)], size)) rows.push(...(await fetchChunk(part)));
  return rows;
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Forge SQL storage adapter.
 * Wraps the Forge storage API (storage.query / storage.execute) for SQL operations.
 * Falls back gracefully when storage is unavailable (e.g. local dev without Forge runtime).
 */
import { storage } from "@forge/api";

export type SqlRow = Record<string, unknown>;

export interface SqlResult {
  rows: SqlRow[];
}

const STORAGE_AVAILABLE = typeof storage !== "undefined" && typeof (storage as any).query === "function";

/**
 * Execute a SQL query. Parameters are passed as a template array; values are interpolated
 * safely using bound-parameter style where the Forge runtime supports it.
 */
export async function query(sqlText: string, ...params: unknown[]): Promise<SqlResult> {
  if (!STORAGE_AVAILABLE) {
    console.warn("[forge-storage] Forge storage.query not available; returning empty result");
    return { rows: [] };
  }
  try {
    const result = await (storage as any).query(sqlText, ...params);
    return { rows: result.rows || result || [] };
  } catch (err) {
    console.warn("[forge-storage] query failed (ignored):", err);
    return { rows: [] };
  }
}

/**
 * Execute a non-query SQL statement (INSERT/UPDATE/DELETE).
 */
export async function execute(sqlText: string, ...params: unknown[]): Promise<void> {
  if (!STORAGE_AVAILABLE) {
    console.warn("[forge-storage] Forge storage not available; skipping execute");
    return;
  }
  try {
    await (storage as any).execute(sqlText, ...params);
  } catch (err) {
    console.warn("[forge-storage] execute failed (ignored):", err);
  }
}

export { STORAGE_AVAILABLE };

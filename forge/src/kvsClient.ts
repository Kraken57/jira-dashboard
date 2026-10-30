/**
 * Stable storage facade for the app: every cached/config value goes through
 * `kvs.get/set/delete` regardless of the backed runtime.
 *
 * ponytail: backed by the legacy @forge/api storage module because its
 * compile service still rejects an explicit @forge/kvs import (verified
 * across CLI 14/15 on 2026-10-26); the legacy module's per-value cap is
 * smaller, hence the reduced chunk size. Swap this import line to
 * `import { kvs } from "@forge/kvs"` when the service accepts it, then raise
 * FEED_PART_BYTES in index.ts to ~175 KB.
 */
import { storage } from "@forge/api";

export const kvs = {
  get: (key: string): Promise<unknown> => storage.get(key) as Promise<unknown>,
  set: (key: string, value: unknown): Promise<void> =>
    storage.set(key, value as never as string),
  delete: (key: string): Promise<void> => storage.delete(key),
};

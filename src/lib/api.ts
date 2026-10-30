import { DashboardData, DashboardFilters, RawFeedPayload } from "./jira/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";

// @forge/bridge v7 may wrap resolver payloads in { body, metadata }; unwrap.
function unwrapBody<D>(response: unknown): D {
  if (response && typeof response === "object" && "body" in response) {
    return (response as { body: D }).body;
  }
  return response as D;
}

/**
 * Universal fetch client:
 * - Inside Atlassian Forge iframe: Uses @forge/bridge invoke('getDashboardData')
 * - Localhost / standalone: Calls Next.js API route /api/jira
 * Real Jira data only. No dummy data, no CSV, no JSON fallback.
 */
export async function fetchDashboardData(filters: DashboardFilters): Promise<DashboardData> {
  // Browser only. @forge/bridge touches `window` at module scope, so it must not
  // be imported during server-side rendering.
  if (typeof window === "undefined") {
    throw new Error("fetchDashboardData must be called in the browser");
  }

  // Forge Custom UI always runs inside an iframe. Localhost does not, so only
  // try the bridge there instead of letting @forge/bridge fail on every load.
  const inForgeIframe = window.self !== window.top;

  if (inForgeIframe) {
    // 1. Forge bridge injected globally by the Forge Custom UI runtime
    const forgeBridge = (window as unknown as {
      bridge?: { invoke: (fn: string, payload?: unknown) => Promise<DashboardData> };
    }).bridge;
    if (forgeBridge && typeof forgeBridge.invoke === "function") {
      try {
        return await forgeBridge.invoke("getDashboardData", filters);
      } catch (err) {
        console.warn("Forge bridge invoke failed, trying @forge/bridge:", err);
      }
    }

    // 2. @forge/bridge invoke (dynamic import keeps it out of the SSR bundle)
    try {
      const { invoke } = await import("@forge/bridge");
      return unwrapBody(
        (await invoke("getDashboardData", filters)) as DashboardData
      );
    } catch (err) {
      throw new Error(
        `Forge bridge is unavailable: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // 3. Next.js API route (localhost / standalone)
  const params = new URLSearchParams({
    pod: filters.podId,
    quarter: filters.quarterId,
    sprint: filters.sprintId,
  });

  const url = `${BASE_URL.replace(/\/+$/, "")}/api/jira?${params.toString()}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      cache: "no-store",
    });
  } catch (err) {
    throw new Error(
      `Could not reach ${url}. Is the Next.js dev server running? ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const body = await res.text();

  if (!res.ok) {
    let detail = body;
    try {
      const json = JSON.parse(body) as { error?: string; details?: string };
      detail = json.details || json.error || body;
    } catch {
      // Response was HTML or empty; keep the raw text.
    }
    throw new Error(
      `Failed to fetch dashboard data (${res.status}): ${detail.slice(0, 400)}`
    );
  }

  try {
    return JSON.parse(body) as DashboardData;
  } catch {
    throw new Error("The dashboard API returned an invalid JSON response.");
  }
}

// ---- Raw feed (fetch once per TTL window, browser computes the filters) ----

const RAW_SESSION_KEY = "jira-raw-feed-v1";
const RAW_FRESH_MS = 5 * 60 * 1000;
const RAW_STALE_OK_MS = 30 * 60 * 1000;

export function readSessionRawFeed(): RawFeedPayload | null {
  try {
    const raw = sessionStorage.getItem(RAW_SESSION_KEY);
    if (!raw) return null;
    const feed = JSON.parse(raw) as RawFeedPayload;
    if (!Array.isArray(feed.items)) return null;
    if (Date.now() - feed.fetchedAt > RAW_STALE_OK_MS) return null;
    return feed;
  } catch {
    return null;
  }
}

export function writeSessionRawFeed(feed: RawFeedPayload): void {
  try {
    sessionStorage.setItem(RAW_SESSION_KEY, JSON.stringify(feed));
  } catch {
    // Quota/private mode: the in-memory copy still powers this tab.
  }
}

/**
 * Fetch the unfiltered raw feed once.
 * - Inside Jira (Forge iframe): resolver getRawFeed (KVS-backed).
 * - Localhost: GET /api/jira?raw=1 (disk-file backed).
 */
export async function fetchRawFeed(): Promise<RawFeedPayload> {
  if (typeof window === "undefined") {
    throw new Error("fetchRawFeed must be called in the browser");
  }

  const inForgeIframe = window.self !== window.top;
  if (inForgeIframe) {
    const { invoke } = await import("@forge/bridge");
    const feed = (await invoke("getRawFeed")) as RawFeedPayload & { error?: string };
    // The resolver packages its own failures as { error } instead of throwing.
    if (feed && typeof feed.error === "string") {
      throw new Error(`Forge raw feed failed: ${feed.error}`);
    }
    return feed;
  }

  const url = `${BASE_URL.replace(/\/+$/, "")}/api/jira?raw=1`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } catch (err) {
    throw new Error(
      `Could not reach ${url}. Is the Next.js dev server running? ${err instanceof Error ? err.message : String(err)}`
    );
  }
  const body = await res.text();
  if (!res.ok) {
    let detail = body;
    try {
      const json = JSON.parse(body) as { error?: string; details?: string };
      detail = json.details || json.error || body;
    } catch {
      // Response was HTML or empty; keep the raw text.
    }
    throw new Error(`Failed to fetch raw feed (${res.status}): ${detail.slice(0, 400)}`);
  }
  try {
    return JSON.parse(body) as RawFeedPayload;
  } catch {
    throw new Error("The dashboard API returned an invalid JSON response.");
  }
}

/** True when the tab copy is older than the 5-min fresh window. */
export function isRawFeedStale(feed: RawFeedPayload): boolean {
  return Date.now() - feed.fetchedAt > RAW_FRESH_MS;
}

import {
  DashboardData,
  DashboardFilters,
  DashboardLoadFailure,
  RawFeedPayload,
  ZephyrData,
} from "./jira/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";

export type RawFeedLoadStage = "connecting" | "jira";

export class DashboardLoadError extends Error {
  readonly failure: DashboardLoadFailure;

  constructor(failure: DashboardLoadFailure) {
    super(failure.message);
    this.name = "DashboardLoadError";
    this.failure = failure;
  }
}

function createDashboardLoadError(
  error: unknown,
  fallbackApi: string,
  fallbackStatusCode: number | null = null,
): DashboardLoadError {
  const message = error instanceof Error ? error.message : String(error);
  const parsedStatus = message.match(/(?:returned|failed:|rate limited)\s*(\d{3})\b/i);
  const api = /zephyr/i.test(message)
    ? "Zephyr Essentials API"
    : /\bjira\b/i.test(message)
      ? "Jira API"
      : fallbackApi;
  return new DashboardLoadError({
    api,
    statusCode: parsedStatus ? Number(parsedStatus[1]) : fallbackStatusCode,
    message,
  });
}

export function getDashboardLoadFailure(error: unknown): DashboardLoadFailure {
  if (error instanceof DashboardLoadError) return error.failure;
  return {
    api: "Dashboard",
    statusCode: null,
    message: error instanceof Error ? error.message : String(error),
  };
}

// @forge/bridge v7 may wrap resolver payloads in { body, metadata }; unwrap.
function unwrapBody<D>(response: unknown): D {
  if (response && typeof response === "object" && "body" in response) {
    return (response as { body: D }).body;
  }
  return response as D;
}

async function addForgeSiteUrl(data: DashboardData): Promise<DashboardData> {
  try {
    const { view } = await import("@forge/bridge");
    const context = await view.getContext();
    const siteUrl = typeof context.siteUrl === "string" ? context.siteUrl.trim() : "";
    if (siteUrl) return { ...data, jiraBaseUrl: siteUrl.replace(/\/+$/, "") };
  } catch (err) {
    console.warn("Could not read Jira site URL from Forge context:", err);
  }
  return data;
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
        return await addForgeSiteUrl(
          await forgeBridge.invoke("getDashboardData", filters)
        );
      } catch (err) {
        console.warn("Forge bridge invoke failed, trying @forge/bridge:", err);
      }
    }

    // 2. @forge/bridge invoke (dynamic import keeps it out of the SSR bundle)
    try {
      const { invoke } = await import("@forge/bridge");
      return await addForgeSiteUrl(
        unwrapBody(
          (await invoke("getDashboardData", filters)) as DashboardData
        )
      );
    } catch (err) {
      throw new Error(
        `Forge bridge is unavailable: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // 3. Next.js API route (localhost / standalone)
  const serializeSelection = (value: string | string[]) =>
    Array.isArray(value) ? value.join(",") : value;
  const params = new URLSearchParams({
    pod: serializeSelection(filters.podId),
    quarter: serializeSelection(filters.quarterId),
    sprint: serializeSelection(filters.sprintId),
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

// v4: invalidate browser snapshots from before optional UAT/leakage feeds existed.
const RAW_SESSION_KEY = "jira-raw-feed-v11";
const RAW_FRESH_MS = 5 * 60 * 1000;
const RAW_STALE_OK_MS = 30 * 60 * 1000;

export function readSessionRawFeed(): RawFeedPayload | null {
  try {
    const raw = sessionStorage.getItem(RAW_SESSION_KEY);
    if (!raw) return null;
    const feed = JSON.parse(raw) as RawFeedPayload;
    if (!Array.isArray(feed.items) || !Array.isArray(feed.qaDefects)) return null;
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
export async function fetchRawFeed(
  forceRefresh = false,
  onStage?: (stage: RawFeedLoadStage) => void,
): Promise<RawFeedPayload> {
  if (typeof window === "undefined") {
    throw new Error("fetchRawFeed must be called in the browser");
  }

  onStage?.("connecting");
  const inForgeIframe = window.self !== window.top;
  if (inForgeIframe) {
    let bridge: typeof import("@forge/bridge");
    try {
      bridge = await import("@forge/bridge");
    } catch (error) {
      throw createDashboardLoadError(error, "Forge bridge");
    }

    onStage?.("jira");
    console.info("[JIRA_FETCH] Forge resolver request started", {
      resolver: "getRawFeed",
      forceRefresh,
    });
    try {
      const feed = unwrapBody<RawFeedPayload & {
        error?: string;
        api?: string;
        statusCode?: number | null;
      }>(await bridge.invoke("getRawFeed", forceRefresh ? { refresh: true } : undefined));
      if (typeof feed?.error === "string") {
        throw new DashboardLoadError({
          api: feed.api || "Forge resolver",
          statusCode: feed.statusCode ?? null,
          message: feed.error,
        });
      }
      if (!feed || !Array.isArray(feed.items)) {
        throw createDashboardLoadError("Forge returned a feed without an items array.", "Forge resolver");
      }
      console.info("[JIRA_FETCH] Forge resolver request completed", {
        source: feed.source,
        itemCount: feed.items.length,
        ageMs: feed.ageMs ?? null,
      });
      console.info("[ZEPHYR_FETCH] Forge data summary", {
        available: feed.zephyr?.available ?? false,
        caseCount: feed.zephyr?.testCasesTotal ?? feed.zephyr?.cases?.length ?? 0,
        executionCount: feed.zephyr?.testExecutionsTotal ?? 0,
      });
      return feed;
    } catch (error) {
      if (error instanceof DashboardLoadError) throw error;
      throw createDashboardLoadError(error, "Forge resolver");
    }
  }

  onStage?.("jira");
  const url = `${BASE_URL.replace(/\/+$/, "")}/api/jira?raw=1${forceRefresh ? "&refresh=1" : ""}`;
  console.info("[JIRA_FETCH] Local request started", {
    endpoint: "/api/jira?raw=1",
    forceRefresh,
  });
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } catch (err) {
    throw createDashboardLoadError(
      `Could not reach ${url}. Is the Next.js dev server running? ${err instanceof Error ? err.message : String(err)}`,
      "Jira API",
    );
  }
  const body = await res.text();
  if (!res.ok) {
    let detail = body;
    let api = "Jira API";
    let statusCode = res.status;
    try {
      const json = JSON.parse(body) as {
        error?: string;
        details?: string;
        api?: string;
        statusCode?: number | null;
      };
      detail = json.details || json.error || body;
      api = json.api || api;
      statusCode = json.statusCode ?? statusCode;
    } catch {
      // Response was HTML or empty; keep the raw text.
    }
    throw createDashboardLoadError(detail.slice(0, 400), api, statusCode);
  }
  try {
    const feed = JSON.parse(body) as RawFeedPayload;
    if (!Array.isArray(feed.items)) {
      throw new Error("The dashboard API response is missing its items array.");
    }
    console.info("[JIRA_FETCH] Local request completed", {
      source: feed.source,
      itemCount: feed.items.length,
      ageMs: feed.ageMs ?? null,
    });
    console.info("[ZEPHYR_FETCH] Local data summary", {
      available: feed.zephyr?.available ?? false,
      caseCount: feed.zephyr?.testCasesTotal ?? feed.zephyr?.cases?.length ?? 0,
      executionCount: feed.zephyr?.testExecutionsTotal ?? 0,
    });
    return feed;
  } catch (error) {
    if (error instanceof DashboardLoadError) throw error;
    throw createDashboardLoadError(
      error instanceof Error ? error.message : "The dashboard API returned invalid JSON.",
      "Dashboard API",
      res.status,
    );
  }
}

/** Fetch the optional, slower Zephyr portfolio after the Jira dashboard renders. */
export async function fetchLocalZephyrData(forceRefresh = false): Promise<ZephyrData> {
  const url = `${BASE_URL.replace(/\/+$/, "")}/api/jira?zephyr=1${forceRefresh ? "&refresh=1" : ""}`;
  const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  const body = await response.text();
  if (!response.ok) {
    let detail = body;
    try {
      const json = JSON.parse(body) as { details?: string; error?: string };
      detail = json.details || json.error || body;
    } catch {
      // Keep a plain-text server response as the diagnostic.
    }
    throw new Error(`Zephyr request failed (${response.status}): ${detail.slice(0, 400)}`);
  }
  const result = JSON.parse(body) as { zephyr?: ZephyrData };
  if (!result.zephyr) throw new Error("The dashboard API returned no Zephyr data.");
  return result.zephyr;
}

/** True when the tab copy is older than the 5-min fresh window. */
export function isRawFeedStale(feed: RawFeedPayload): boolean {
  return Date.now() - feed.fetchedAt > RAW_FRESH_MS;
}

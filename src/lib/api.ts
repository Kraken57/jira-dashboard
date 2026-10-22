import { DashboardData, DashboardFilters } from "./jira/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";

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

  // 1. Forge bridge injected globally by the Forge Custom UI runtime
  const forgeBridge = (window as unknown as {
    bridge?: { invoke: (fn: string, payload?: unknown) => Promise<DashboardData> };
  }).bridge;
  if (forgeBridge && typeof forgeBridge.invoke === "function") {
    try {
      return await forgeBridge.invoke("getDashboardData", filters);
    } catch (err) {
      console.warn("Forge bridge invoke failed, falling back to REST endpoint:", err);
    }
  }

  // 2. @forge/bridge invoke (dynamic import keeps it out of the SSR bundle)
  try {
    const { invoke } = await import("@forge/bridge");
    return await invoke("getDashboardData", filters);
  } catch {
    // Not in a Forge context, fall through to REST
  }

  // 3. Next.js API route (localhost / standalone)
  const params = new URLSearchParams({
    pod: filters.podId,
    quarter: filters.quarterId,
    sprint: filters.sprintId,
  });

  const res = await fetch(`${BASE_URL}/api/jira?${params.toString()}`, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch dashboard data: ${res.statusText}`);
  }

  return res.json();
}

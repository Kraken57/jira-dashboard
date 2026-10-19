import { DashboardData, DashboardFilters } from "./jira/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";

/**
 * Universal fetch client:
 * - When in Atlassian Forge iframe: Uses @forge/bridge invoke('getDashboardData')
 * - When running in localhost/standalone: Calls Next.js API route /api/jira
 */
export async function fetchDashboardData(filters: DashboardFilters): Promise<DashboardData> {
  // 1. Check for Atlassian Forge bridge in window
  if (typeof window !== "undefined") {
    const forgeBridge = (
      window as unknown as {
        bridge?: { invoke: (fn: string, payload?: unknown) => Promise<DashboardData> };
      }
    ).bridge;

    if (forgeBridge && typeof forgeBridge.invoke === "function") {
      try {
        return await forgeBridge.invoke("getDashboardData", filters);
      } catch (err) {
        console.warn("Forge bridge invoke failed, falling back to REST endpoint:", err);
      }
    }
  }

  // 2. Standard REST API call to Next.js route
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

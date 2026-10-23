# 02 - Architecture & Data Flow

> **Historical snapshot.** For current behavior, setup, and metrics, read
> [`08-complete-system-guide.md`](08-complete-system-guide.md) first.

This document outlines how data flows from Jira Cloud to the user interface, covering both Localhost and Atlassian Forge modes.

---

## 1. Dual-Mode Universal Client (`src/lib/api.ts`)

To ensure that the application runs identically on **localhost:3000** during development and inside an **Atlassian Forge iframe** in production, the data fetching layer uses a universal bridge pattern:

```typescript
export async function fetchDashboardData(filters: DashboardFilters): Promise<DashboardData> {
  // 1. Check if running inside Atlassian Forge iframe
  if (typeof window !== "undefined") {
    const forgeBridge = (window as any).bridge;
    if (forgeBridge && typeof forgeBridge.invoke === "function") {
      try {
        return await forgeBridge.invoke("getDashboardData", filters);
      } catch (err) {
        console.warn("Forge bridge invoke failed, falling back to REST endpoint:", err);
      }
    }
  }

  // 2. Localhost / Standalone fallback: Call Next.js API route
  const params = new URLSearchParams({
    pod: filters.podId,
    quarter: filters.quarterId,
    sprint: filters.sprintId,
  });

  const res = await fetch(`/api/jira?${params.toString()}`);
  return res.json();
}
```

### Why this is powerful:
- **Zero code rewrites**: The React UI never needs to know if it is running on localhost, Vercel, or inside Atlassian Forge.
- **Instant local testing**: Developers can iterate rapidly with hot-module reloading without having to deploy to Forge every time.

---

## 2. Server-Side Data Layer (`src/lib/jira/jiraService.ts`)

When running on localhost or via the Next.js API route `/api/jira`, `jiraService.ts` manages communication with Atlassian Cloud.

### High-Speed In-Memory Cache
Querying 930+ issues from Jira Cloud requires 10 sequential paginated API calls (100 issues per page). Running this on every filter click would cause 10-12 second page delays and risk hitting Jira rate limits.

`jiraService.ts` implements a 5-minute memory cache:
```typescript
let cachedWorkItems: JiraWorkItem[] | null = null;
let lastCacheTime: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function fetchAllJiraWorkItems(): Promise<JiraWorkItem[]> {
  const now = Date.now();
  if (cachedWorkItems && now - lastCacheTime < CACHE_TTL_MS) {
    return cachedWorkItems; // Returns in <1ms!
  }

  // Fetch all 10 pages from Jira Cloud...
  cachedWorkItems = allIssues;
  lastCacheTime = now;
  return allIssues;
}
```

**Result:** Filter response times dropped from **12,000ms** to **~20ms per filter change**.

---

## 3. Filter Processing Pipeline

When a user selects a Pod, Quarter, or Sprint:
1. `DashboardPage.tsx` fires `useEffect` with the updated filter IDs.
2. The request reaches `getDashboardData(filters)` in `jiraService.ts`.
3. The dataset is filtered via `matchesQuarter`, `matchesSprint`, and `matchesPod`:
   - **Pod Matching**: `podId === "all" || item.podKey === podId`
   - **Quarter Matching**: Normalizes custom quarter strings (e.g., `CY26 PI.1`, `CY26 PI.2`, `CY26 PI.3`, `CY26 PI.4`).
   - **Sprint Matching**: Handles multi-sprint issues where sprints are comma-separated in Jira (e.g., `"2026-Q3 Iteration 1, 2026-Q3 Iteration 2"`).
4. The filtered array is passed to `computeDashboardData(activeItems, filters)` in `metricsEngine.ts`.
5. The complete `DashboardData` payload is returned to the frontend.

---

## 4. Fallback Architecture (`enterpriseData.json`)

If Jira API credentials are not provided or Atlassian Cloud is unreachable:
1. `jiraService.ts` catches the error.
2. It automatically falls back to `src/lib/jira/enterpriseData.json`, an offline dataset of all 930 issues with full story points, assignee names, and priorities.
3. The application continues running without crashing or displaying blank screens.


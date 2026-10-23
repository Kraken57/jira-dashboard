# 07 - Developer Handbook & Contributor Guide

> **Historical snapshot.** For current behavior, setup, and metrics, read
> [`08-complete-system-guide.md`](08-complete-system-guide.md) first.

Welcome to the **Enterprise Sprint Performance Dashboard** project! This guide is written for new team members, freshers, and experienced engineers to quickly understand, extend, and maintain this codebase.

---

## 1. Prerequisites & Environment Setup

1. **Node.js**: v20 or higher (`node -v`).
2. **Package Manager**: `pnpm` v10+ (`pnpm -v`).
3. **Environment Variables**:
   In the project root, create or verify `.env.local`:
   ```bash
   NEXT_PUBLIC_JIRA_DOMAIN=https://one-atlas-yzpp.atlassian.net
   JIRA_EMAIL=your-email@example.com
   JIRA_API_TOKEN=your_atlassian_api_token
   NEXT_PUBLIC_API_BASE_URL=
   ```

---

## 2. Running Locally

### Start Development Server
```bash
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser. Hot reloading is enabled with Turbopack.

### Run TypeScript Validation
```bash
pnpm exec tsc --noEmit
```

### Run Production Build
```bash
pnpm run build
```

---

## 3. How to Add a New Metric (Step-by-Step)

If product management asks you to add a new metric (e.g. "Release Readiness Score"):

1. **Update Types (`src/lib/jira/types.ts`)**:
   Add the new metric field to `DashboardData` or the relevant sub-interface:
   ```typescript
   export interface QualityData {
     // ...
     releaseReadinessScore: number;
   }
   ```

2. **Implement Calculation (`src/lib/jira/metricsEngine.ts`)**:
   Locate the calculation section in `computeDashboardData()`:
   ```typescript
   const releaseReadinessScore = Math.round((quality.resolutionRate * 0.6) + (predictabilityScore * 0.4));
   ```
   Add it to the returned object.

3. **Render in UI (`src/components/tabs/QualityTab.tsx`)**:
   Display the new metric in a `MetricCard` or custom card container:
   ```tsx
   <div className="bg-white border border-jira-border rounded-lg p-4 shadow-sm">
     <p className="text-xs uppercase text-jira-text-muted font-bold">Release Readiness</p>
     <p className="text-2xl font-bold text-jira-green mt-1">{data.releaseReadinessScore}%</p>
   </div>
   ```

---

## 4. How to Add a New Tab (Step-by-Step)

1. **Create the Tab Component**:
   Create `src/components/tabs/NewTab.tsx`:
   ```tsx
   "use client";
   import { DashboardData } from "@/lib/jira/types";

   export function NewTab({ data }: { data: DashboardData }) {
     return <div className="space-y-6">...</div>;
   }
   ```

2. **Register Tab in `src/app/page.tsx`**:
   Add to `TABS` array:
   ```typescript
   const TABS = [
     // ...
     { id: "new-tab", label: "New View" },
   ];
   ```

3. **Render Tab Conditionally in `src/app/page.tsx`**:
   ```tsx
   {activeTab === "new-tab" && dashboardData && (
     <NewTab data={dashboardData} />
   )}
   ```

---

## 5. Coding Standards & Best Practices

- **Zero Inline Styles**: Use Tailwind CSS classes matching the design tokens (`bg-jira-bg`, `text-jira-text`, `border-jira-border`).
- **Senior-Level Simplicity**: Write concise, readable, self-documenting code. Avoid deep nesting or redundant wrapper abstractions.
- **Defensive Data Handling**: Jira custom fields can occasionally be null or undefined. Always use nullish coalescing (`?? 0`) and fallback arrays (`sprints || []`).
- **Preserve Documentation**: When modifying existing logic or adding metrics, update `documentation/03-metrics-and-business-logic.md` to keep documentation evergreen.

---

## 6. Troubleshooting Common Issues

| Issue | Cause | Fix |
|---|---|---|
| **HTTP 410 Gone from Jira** | Calling deprecated `GET /rest/api/3/search` | Use `POST /rest/api/3/search/jql` in `jiraService.ts`. |
| **HTTP 401 / 403 Forbidden** | Scoped API token missing project permissions | Generate a standard unscoped API token at `id.atlassian.com`. |
| **Stale Jira Data** | In-memory cache is active | Cache automatically refreshes every 5 minutes. Restart `pnpm dev` for instant refresh. |
| **Blank Screen / Undefined Values** | New custom field added in Jira | Check `customfield_10031` / `customfield_10020` mapping in `jiraService.ts`. |


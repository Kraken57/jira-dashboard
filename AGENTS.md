<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project: Jira Dashboard (Enterprise Sprint Performance)

A read-only sprint-performance dashboard for Jira Cloud. It pulls issues over the Jira REST API, computes delivery metrics in memory, and renders seven tabs (Executive Summary, Pod View, Developer View, Quality, Predictability, Delivery Diagnosis, Issues). Every KPI card and most table rows are clickable and open a popup listing the exact work items behind the number — popups never refetch.

The same React codebase runs in two modes:

| Mode | Frontend | Data source |
|---|---|---|
| Local / standalone | Next.js app (`pnpm dev`) | `GET /api/jira` → Jira Cloud REST (`POST /rest/api/3/search/jql`, Basic auth from `.env.local`) |
| Atlassian Forge | Static export served in a Jira iframe (`out/`) | Forge resolver via `@forge/bridge` → `@forge/api` (`api.asApp()`) |

There is **no database and no mock data** — no Jira config means an error, never fake numbers. `pnpm run build:forge` temporarily swaps `src/app/api/jira/route.ts` for a static 404 stub, exports to `out/`, copies to `forge/out/`, and restores the route (also auto-restored by `predev`/`prebuild` via `scripts/ensure-local-route.mjs`).

## Source of truth for details

- `documentation/08-complete-system-guide.md` — architecture, data flow, exact metric formulas, filter semantics, popup behavior, API contract, Forge deployment, troubleshooting. **Read this before changing behavior.** Files `01`–`07` are older design snapshots and lose where they conflict.
- `PROJECT_CONTEXT.md` — concise architecture/feature overview, key files, and known unresolved issues.
- The Forge backend has **no import from the frontend**; it duplicates quarter parsing, done statuses, and predictability math in `forge/src/index.ts`. Keep both copies in sync when changing shared rules.

## Tech stack

- Next.js `16.4.2` (App Router, `src/` directory; Turbopack dev), React `19.3.0`, TypeScript 5
- Tailwind CSS v4 (`@tailwindcss/turbopack`), Chart.js 4 + react-chartjs-2
- `@forge/api` / `@forge/resolver` / `@forge/bridge` for the Forge side — `forge/` is a standalone pnpm project (own `package.json` + lockfile, nodejs22.x runtime), not a workspace member; `pnpm-workspace.yaml` only carries pnpm policy settings
- Secrets live in `.env.local` (never commit — it is gitignored); `.env.example` documents all knobs

## Commands

```bash
pnpm dev                 # dev server (predev restores the local /api/jira route if needed)
pnpm build               # local production build (server + API route)
pnpm run build:forge     # static export into ./out, copied to forge/out
pnpm lint                # ESLint (flat config, eslint-config-next)
pnpm discover:fields     # list Jira custom fields + sample values (reads .env.local)
pnpm probe               # identify SP/POD fields and done statuses
forge deploy / install   # from forge/ — deploy the Forge app (see doc 08 §13)
```

Verification before declaring done (no test suite exists — typecheck, lint, build, and manual checks are the only gates):

```bash
node_modules/typescript/bin/tsc --noEmit                              # app typecheck
cd forge && node node_modules/typescript/bin/tsc --noEmit             # Forge typecheck
node node_modules/eslint/bin/eslint.js src                            # lint
pnpm build && pnpm run build:forge                                    # both build modes
```

Runtime sanity: `GET /api/jira?pod=all&quarter=all&sprint=all` returns `summary.totalIssues`, `metrics`, `issueList`, `jiraBaseUrl`. Doc 08 §16 has the full checklist (executive Say/Do = completed/total SP, popups match cards, sprint dropdown survives a specific selection, Pod/Quarter change resets Sprint, Forge build leaves `route.ts` restored with `force-dynamic`).

## Where things live / data flow

```
src/app/page.tsx                 # "use client" shell: tabs, shared Pod/Quarter/Sprint filters,
                                 #   per-tab extras (developer/status), data fetch, exec popups
src/lib/api.ts                   # fetchDashboardData: Forge bridge when in an iframe, else GET /api/jira
src/app/api/jira/route.ts        # localhost-only route (force-dynamic); stubbed out in Forge builds
src/lib/jira/jiraService.ts      # paginated Jira fetch + field mapping + quarter derivation
                                 #   + ~5 min in-memory raw cache (JIRA_CACHE_TTL_MS)
src/lib/jira/metricsEngine.ts    # ALL math — pure computeDashboardData(items, filters, sprintMeta)
src/lib/jira/types.ts            # DashboardData + every sub-type; api contract between all layers
src/lib/jira/metricDefinitions.ts# plain-language explanations keyed by card title (popup fallback)
src/components/                  # MetricCard, VelocityGrid, TrendsCharts, TabFilters, Dropdown,
                                 #   DetailModal (popup shell), IssuesModal (popup rows+insights)
src/components/tabs/             # one component per dashboard tab
forge/                           # Forge backend: src/index.ts (dashboard resolver), src/admin.ts,
                                 #   src/api/jiraClient.ts, plus declared-but-unwired sync/event/SQL modules
scripts/                         # build-forge.mjs, ensure-local-route.mjs, discover-fields.mjs, probe.mjs
```

Mental model: issues are downloaded once (and cached raw), filtered in memory into one `DashboardData` object; every tab and popup is a view of that object. Popups must be derivable from the same filter scope as the card they belong to — never fetch on popup open.

## Conventions and gotchas

- Keep `metricsEngine.ts` pure (same items + filters ⇒ same output). It is client-agnostic and Forge-parity work should port from it, not patch ad hoc.
- "Done" is an exact, case-sensitive status match against `JIRA_DONE_STATUSES`; sub-tasks additionally accept `JIRA_SUBTASK_DONE_STATUSES`. Sub-tasks are excluded from all metrics except Developer View (Story + Sub-task), and inherit parent sprint/quarter.
- Sprint matching (`matchesSprint`) is a forgiving lowercase `includes` in either direction — local mode only. The Forge resolver uses exact matching.
- Changing Pod or Quarter resets Sprint to `all` (sprints belong to a pod/quarter). When a specific sprint is selected, `page.tsx` fires a second parallel request with `sprint=all` to keep the sprint dropdown populated — keep that two-request logic.
- Quarter ids (`CY26 PI.3`) derive from the **last** sprint name on an issue locally (Forge: first). Sprint naming regexes live in `quarterFromSprint` (both copies), `sprintDisplayName`/`sprintOrderKey` in `metricsEngine.ts`; add regex branches if sprint names change.
- New card titles need a `metricDefinitions.ts` entry so popups are never blank.
- `next.config.ts` switches to `output: "export"` when `FORGE_BUILD=true`. Do not try to satisfy the export by disabling the API route in code; rely on the build script's temporary route swap.
- `.env.example` documents every env var (Jira host/email/token, JQL, custom field IDs, done statuses, cache TTL, sprint window). Field IDs differ per Jira site — always discover them with the scripts.
- The `out/` and `.next/` build outputs, `forge/out/`, and `.env*` files are gitignored and can be ignored during analysis.

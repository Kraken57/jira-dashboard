# PROJECT_CONTEXT — Jira Dashboard (Enterprise Sprint Performance)

> Concise, code-verified overview for agents and new contributors. For full detail
> (exact metric formulas, popup behavior, API contract, deployment, troubleshooting),
> see `documentation/08-complete-system-guide.md` — the current source of truth.
> Docs `01`–`07` are older design snapshots and may be stale.

## What it is

A read-only sprint-performance dashboard for Jira Cloud. It downloads issues via JQL,
computes delivery metrics in memory, and renders seven tabs, every KPI card and most
table rows opening a popup with the exact work items behind the number (never a refetch).

One React codebase, two run modes:

| Mode | Frontend | Data source |
|---|---|---|
| Local / standalone | Next.js app (`pnpm dev`) | `GET /api/jira` → Jira Cloud REST `POST /rest/api/3/search/jql` (Basic auth from `.env.local`) |
| Atlassian Forge | Static export (`out/` → `forge/out/`) in a Jira iframe | Forge resolver via `@forge/bridge` → `api.asApp()` |

No database, no mock data: without Jira config the app errors instead of showing fake numbers.

### Tech stack

- Next.js 16.4.2 (App Router, `src/` dir, Turbopack dev), React 19.3.0, TypeScript 5
- Tailwind CSS v4, Chart.js 4 + react-chartjs-2
- Forge backend: `@forge/api`, `@forge/resolver`, `@forge/bridge` (nodejs22.x; separate pnpm project under `forge/`)

## Architecture & data flow

```
Jira Cloud
  │  (local: Basic auth, paginated nextPageToken, ~50 pages × 100)
  ▼
src/lib/jira/jiraService.ts     fetch + map → JiraWorkItem[] + sprint meta (5-min in-memory cache)
  ▼
src/app/api/jira/route.ts       GET /api/jira?pod=&quarter=&sprint= (localhost only; 404 stub in Forge builds)
  ▼
src/lib/jira/metricsEngine.ts   computeDashboardData(items, filters, sprintMeta) → DashboardData (pure)
  ▼
src/app/page.tsx                "use client" shell: tabs, shared + per-tab filters, popups
  ▼
src/components/ + tabs/         cards, charts, modals (client-side only)

Forge mode: src/lib/api.ts detects the iframe → @forge/bridge invoke('getDashboardData')
→ forge/src/index.ts resolver duplicates fetch/mapping/metrics with api.asApp() (no cache).
```

Key contract: `DashboardData` in `src/lib/jira/types.ts` — pods/quarters/sprints options,
`metrics` (KPI cards), `velocity`/`delivery`/`trends` (charts), `summary`, `developers`,
`sprintAnalysis`, `quality`, `predictability`, `diagnosis`, `issueList` (every scoped item),
`developerIssueList` (Story + Sub-task subset), `podFeatureList`, `metricInsights`, `jiraBaseUrl`.

### Filter semantics

- Pod / Quarter / Sprint filter state is shared across tabs (in React state, not URL — reloads reset it). Developer (Developer tab) and Status (Diagnosis tab) filters are per-tab.
- Changing Pod or Quarter resets Sprint. A selected sprint triggers a second parallel `sprint=all` request so the dropdown stays populated.
- Pod = Jira project key (POD custom field only names the pod); Quarter (`CY26 PI.3`) derives from the last sprint name on an issue; sprint matching is lowercase fuzzy `includes`.

### Features by tab

- **Executive Summary** — 4 clickable KPI cards (Say/Do, Sprint Carry Over, Avg./Total Sprint Velocity, Future Predictability) + velocity/delivery charts (`VelocityGrid`) and trend charts (velocity trajectory w/ expanding moving average, cumulative throughput) with rich per-metric popups (`metricInsights`).
- **Pod View** — feature/story stat cards (features fall back to Epic when absent; `podFeatureList` keeps features visible across sprint/quarter selections), work-type selector + status pie chart.
- **Developer View** — per-developer cards + tinted table (completion >70% yellow, ≤70% red) counting Story + Sub-task only, with SP and hours (from `timeoriginalestimate`); sub-tasks inherit parent sprint/quarter.
- **Quality** — bug density/resolution metrics; priority section counts all issues (labelled "Defect Severity").
- **Predictability** — Say/Do score, variance, plus per-sprint history table (cards open the table in `DetailModal`, not issue lists).
- **Delivery Diagnosis** — slippage SP/%, primary driver (rule-based first match), contributor spillover, status-filterable unfinished list.
- **Issues** — full explorer: client-side search, type/status filters, 25-row pagination, Jira browse links.

## Key files

| Path | Role |
|---|---|
| `src/app/page.tsx` | Dashboard shell: tabs, filters, data fetch, exec popups |
| `src/lib/api.ts` | Universal client: Forge bridge detection → `/api/jira` fallback |
| `src/app/api/jira/route.ts` | Local-only API route; force-dynamic; stubbed during Forge builds |
| `src/lib/jira/jiraService.ts` | Jira fetch/pagination/mapping, quarter derivation, in-memory cache |
| `src/lib/jira/metricsEngine.ts` | ALL metric math (pure); largest logic file (~1.5k lines) |
| `src/lib/jira/types.ts` | `DashboardData` type contract |
| `src/lib/jira/metricDefinitions.ts` | Card-title → plain-language explanation (popup fallback) |
| `src/components/IssuesModal.tsx`, `DetailModal.tsx` | Popup machinery (515 + 62 lines) |
| `src/components/tabs/` | One component per tab |
| `forge/src/index.ts` | Forge dashboard resolver (no frontend imports; duplicated logic) |
| `forge/src/admin.ts`, `config/`, `sync/`, `events/`, `storage/db.ts`, `sql/schema.sql` | Declared Forge modules for config/caching/sync — **not wired** into the read-only flow |
| `forge/manifest.yml` | Modules (global/admin page, trigger, scheduled, queue consumer, SQL), scopes, app id |
| `scripts/build-forge.mjs` / `ensure-local-route.mjs` | Static-export build w/ safe route swap + restore |
| `scripts/discover-fields.mjs`, `probe.mjs` | Per-site Jira custom-field/status discovery |
| `documentation/08-complete-system-guide.md` | Detailed source of truth |

## Setup notes

- Node 20+, pnpm 10+; env config in `.env.local` (see `.env.example` for every variable: Jira host/email/token, JQL, SP/Sprint/POD custom field IDs, done statuses, cache TTL, sprint window, reveal days).
- Custom field IDs differ per Jira site — always run `pnpm discover:fields` + `pnpm probe` and confirm auth with `/rest/api/3/myself` first.
- `pnpm run build:forge` then `forge deploy` / `forge install` (from `forge/`); Forge variables carry the per-env config.

## Unresolved issues / known gaps (verified)

**Forge parity gaps** (local engine vs `forge/src/index.ts`): quality/sprint-analysis/diagnosis data mostly zero; `issueList.isDone` missing in Forge (status pills render as not done); quarter derived from *first* sprint in Forge vs *last* locally; exact vs fuzzy sprint matching; pod key from POD field vs project key; no Forge cache; no upcoming-sprint filtering; raw sprint names/last-5 ordering. Doc 08 §17 recommends porting engine logic rather than ad-hoc fixes.

**Metric semantics**:
- Planned = committed (Jira doesn't expose original commitment post-scope-change).
- Cycle time and scope churn permanently N/A (needs changelog data, never fetched).
- Future Predictability is a weekday-based due-date forecast, not Say/Do; `epicsOnSchedule` uses it.
- Quality's "Defect Severity" section counts all work items by priority, not just bugs.
- Sub-tasks excluded from all metrics except Developer View; per-sprint sums can overcount carried work (executive All-Sprints totals are de-duplicated to compensate).
- Two different "moving averages" coexist: trailing 3-sprint (velocity chart, computed in the component) vs expanding (trend chart, from the engine).

**UI/architecture**:
- Filters not in URL — nothing bookmarkable/shareable.
- `DetailModal` has no focus trap (accessibility gap).
- Pods collapse to one per Jira project even if the POD field holds several team values inside a project (`derivePods` keys on project key).
- No automated tests — typecheck, lint, and a manual runtime checklist (doc 08 §16) are the only verification.
- Forge admin page reuses the dashboard bundle; no dedicated admin UI component exists (resolver only).
- Local API route is unauthenticated; cache is per-process (cold serverless instances refetch).
- README.md is default create-next-app boilerplate and barely matches the project.
- Forge event/queue/scheduled/SQL modules are declared in `forge/manifest.yml` but unwired; using them requires provisioning the MySQL module first (`forge/sql/schema.sql`).

## Last reviewed

2026-10-29 — structure, data flow, engine formulas, Forge manifest/resolver, and scripts
verified against source; app typecheck (`tsc --noEmit`) passes clean on both root and `forge/`.

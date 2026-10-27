# 08 — Complete System Guide (Current Source of Truth)

> **Read this file first.** It describes how the dashboard actually works today, end to end:
> data fetching, filtering, metrics, every card and popup, local setup, Forge deployment,
> and how to point the same code at a different Jira site or a different dashboard.
>
> Files `01`–`07` in this folder are earlier design snapshots. Where they disagree with this
> document (hard-coded Jira sites, old component lists, old formulas), **this document wins.**

---

## Table of contents

1. [What this application is](#1-what-this-application-is)
2. [The one-sentence mental model](#2-the-one-sentence-mental-model)
3. [Quick start](#3-quick-start)
4. [Repository map](#4-repository-map)
5. [End-to-end data flow](#5-end-to-end-data-flow)
6. [Filters: shared vs per-tab](#6-filters-shared-vs-per-tab)
7. [Tabs, cards, and what each popup shows](#7-tabs-cards-and-what-each-popup-shows)
8. [How popups work](#8-how-popups-work)
9. [Metrics: exact rules and formulas](#9-metrics-exact-rules-and-formulas)
10. [Jira mapping rules](#10-jira-mapping-rules)
11. [Caching and refresh behavior](#11-caching-and-refresh-behavior)
12. [API contract](#12-api-contract)
13. [Forge deployment](#13-forge-deployment)
14. [Adapting this to another Jira site or dashboard](#14-adapting-this-to-another-jira-site-or-dashboard)
15. [Troubleshooting](#15-troubleshooting)
16. [Verification checklist](#16-verification-checklist)
17. [Known limitations and parity gaps](#17-known-limitations-and-parity-gaps)
18. [Glossary](#18-glossary)

---

## 1. What this application is

A read-only sprint-performance dashboard for Jira Cloud.

- It pulls issues from Jira with a JQL query.
- It computes delivery metrics in memory.
- It renders nine tabs (Executive, Pod, Developer, Sprint, Quality, Predictability,
  Delivery Diagnosis, Trends, Issues).
- Every KPI card and most table rows are **clickable** and open a popup with the exact
  work items behind that number.

It runs in two modes from the same React codebase:

| Mode | Frontend | Data source | Use case |
|---|---|---|---|
| Local / standalone | Next.js app (`pnpm dev`) | `GET /api/jira` (Next.js route → Jira REST) | Development, internal hosting |
| Atlassian Forge | Static export inside a Jira iframe | Forge resolver over `@forge/bridge` → `@forge/api` | Native Jira Cloud app |

There is **no database and no mock data**. If Jira is not configured, the app returns an
error instead of fake numbers.

---

## 2. The one-sentence mental model

> **Jira issues are downloaded once, cached briefly, filtered in memory, turned into one
> `DashboardData` object, and every tab and popup is just a different view of that same object.**

This is why popups open instantly: the issue rows are already in the browser.

```
Jira issues ──► JiraWorkItem[] ──► computeDashboardData(filters) ──► DashboardData ──► tabs/cards/popups
                (raw, cached)          (pure function)              (one JSON object)
```

---

## 3. Quick start

### 3.1 Prerequisites

- Node.js 20+
- `pnpm` 10+
- A Jira Cloud account and an API token:
  <https://id.atlassian.com/manage-profile/security/api-tokens>

### 3.2 Install

```bash
pnpm install
```

> On Windows/WSL, always install dependencies in the same environment that runs the app.
> `node_modules` contains OS-specific Next.js binaries (`@next/swc-*`); a copy from another
> OS will fail to start.

### 3.3 Configure

Copy `.env.example` to `.env.local` and fill in the values:

```bash
JIRA_HOST=https://your-site.atlassian.net
JIRA_EMAIL=you@example.com
JIRA_API_TOKEN=your-token
JIRA_JQL=project in (ABC)
JIRA_STORY_POINTS_FIELD=customfield_10031
JIRA_SPRINT_FIELD=customfield_10020
JIRA_POD_FIELD=customfield_10050
JIRA_DONE_STATUSES=Done,Accepted,Released,Closed,Resolved
```

Custom field IDs are **different on every Jira site**. Do not trust the examples; discover
them:

```bash
pnpm discover:fields   # lists custom fields, sample values, status names
pnpm probe             # confirms which field holds Story Points / POD / done statuses
```

Both scripts read `.env.local` and print what they find. Always confirm the token first:
`GET /rest/api/3/myself` must return your user. A bad token can still make
`/rest/api/3/field` return HTTP 200 with an empty custom-field list, which looks like a
permissions problem but is really an auth problem.

### 3.4 Run

```bash
pnpm dev
```

Open <http://localhost:3000>.

### 3.5 Sanity-check the API directly

```bash
curl "http://localhost:3000/api/jira?pod=all&quarter=all&sprint=all" | head -c 500
```

A healthy response contains `summary.totalIssues`, `metrics`, `issueList`, and
`jiraBaseUrl`.

---

## 4. Repository map

```
src/
├── app/
│   ├── page.tsx                  # Dashboard shell: tabs, shared filters, data fetch, exec modal
│   ├── layout.tsx                # Root layout, fonts, global styles
│   ├── globals.css               # Tailwind + Jira color tokens
│   └── api/jira/route.ts         # Localhost-only API route (swapped out for Forge builds)
│
├── lib/
│   ├── api.ts                    # Universal client: Forge bridge → /api/jira fallback
│   └── jira/
│       ├── config.ts             # JIRA_HOST / JIRA_EMAIL / JIRA_API_TOKEN
│       ├── jiraService.ts        # Fetch + paginate + map Jira, in-memory cache, quarter parsing
│       ├── metricsEngine.ts      # ALL metric calculations (pure function)
│       ├── metricDefinitions.ts  # Plain-language explanations for every card title
│       └── types.ts              # DashboardData and every sub-type
│
├── components/
│   ├── DashboardLayout.tsx       # Top bar + page container
│   ├── TabBar.tsx                # Tab navigation
│   ├── Dropdown.tsx              # Generic filter dropdown
│   ├── TabFilters.tsx            # Per-tab filter bar + FilterKey/FilterState types
│   ├── MetricCard.tsx            # Executive KPI card (clickable)
│   ├── VelocityGrid.tsx          # Velocity + delivery charts
│   ├── DetailModal.tsx           # Generic popup shell
│   ├── IssuesModal.tsx           # Popup that lists work items
│   └── tabs/                     # One component per tab
│
forge/
├── manifest.yml                  # Forge modules, functions, scopes, app id
├── src/index.ts                  # Dashboard resolver (Forge backend)
├── src/admin.ts                  # Admin resolver (field/JQL config in Forge storage)
├── src/api/jiraClient.ts         # Jira REST client for Forge (api.asApp, retries, pagination)
└── sql/schema.sql                # Optional future storage schema (not required today)
│
scripts/
├── build-forge.mjs               # Static export + temporary /api/jira stub
├── discover-fields.mjs           # List custom fields + statuses
└── probe.mjs                     # Identify SP/POD fields and done statuses
```

Key entry points:

- UI state and filters: `src/app/page.tsx`
- Data fetch: `src/lib/api.ts` → `src/app/api/jira/route.ts` → `src/lib/jira/jiraService.ts`
- All math: `src/lib/jira/metricsEngine.ts`
- Popup table: `src/components/IssuesModal.tsx`
- Forge backend: `forge/src/index.ts`

---

## 5. End-to-end data flow

### 5.1 Local mode

```
Browser
  src/app/page.tsx
    useEffect(...)  ──► fetchDashboardData({ podId, quarterId, sprintId })
                          │
                          ▼
                    src/lib/api.ts
                      no Forge bridge
                      dynamic import("@forge/bridge") fails
                          │
                          ▼
                    GET /api/jira?pod=…&quarter=…&sprint=…
                          │
                          ▼
                    src/app/api/jira/route.ts
                          │
                          ▼
                    getDashboardData(filters)
                          │
              ┌───────────┴────────────┐
              │ cache fresh?           │ cache stale/missing?
              │ return cached items    │ POST /rest/api/3/search/jql (paginated)
              └───────────┬────────────┘
                          ▼
                    JiraWorkItem[] + sprintMeta
                          │
                          ▼
                    computeDashboardData(items, filters, sprintMeta)
                          │
                          ▼
                    DashboardData JSON
                          │
                          ▼
                    React state → tabs → cards → popups
```

### 5.2 Forge mode

```
Jira global page iframe
  static frontend from ./out
    fetchDashboardData(...)
      @forge/bridge invoke("getDashboardData", filters)
                          │
                          ▼
              forge/src/index.ts resolver
                getFieldConfig()  (Forge storage, with defaults)
                JiraClient.searchIssuesJql(jql, fields)
                  api.asApp().requestJira(...)  (retries on 429/503)
                          │
                          ▼
                mapIssueToWorkItem(...) → calculateKPIs(...)
                          │
                          ▼
                DashboardData-shaped JSON → React state
```

The React components never know which mode they are in. They only call
`fetchDashboardData()`.

### 5.3 What is computed where

| Layer | Responsibility |
|---|---|
| `jiraService.ts` | Auth, pagination, field extraction, sprint metadata, cache |
| `metricsEngine.ts` | Filtering, aggregation, every KPI, every tab's dataset, issue list |
| `page.tsx` | Which tab is active, which filters apply, when to refetch |
| Tab components | Presentation + opening the correct popup |
| `IssuesModal` | Explains the metric, filters the rows, and renders `IssueRow`s with Jira links |

---

## 6. Filters: shared vs per-tab

Filters live in React state in `src/app/page.tsx`. They are **not** stored in the URL or
localStorage, so a page reload resets them.

### 6.1 Shared base filters

`pod`, `quarter`, and `sprint` are shared across all tabs:

```ts
const BASE_DEFAULT = { pod: "all", quarter: "all", sprint: "all" };
```

Switching tabs keeps your Pod/Quarter/Sprint selection. Changing **Pod or Quarter**
automatically resets Sprint to `all`, because sprint names usually belong to one
pod/quarter.

### 6.2 Per-tab extra filters

Each tab declares which filters it shows:

| Tab | Filters shown |
|---|---|
| Executive Summary | Pod, Quarter, Sprint |
| Pod View | Pod, Quarter, Sprint |
| Developer View | Pod, Quarter, Sprint, **Developer** |
| Sprint Analysis | Pod, Quarter, Sprint |
| Quality | Pod, Quarter, Sprint |
| Predictability | Pod, Quarter |
| Delivery Diagnosis | Pod, Quarter, Sprint, **Status** |
| Trends | Pod, Quarter, **Window** |
| Issues | Pod, Quarter, Sprint |

Extras are stored per tab, so a Developer selection on the Developer tab does not leak
into another tab.

Tabs that do not show a Sprint filter always request `sprintId: "all"` (they show the whole
selected window):

```ts
const effectiveSprint = filterKeys.includes("sprint") ? baseFilters.sprint : "all";
```

### 6.3 Reset

The Reset button resets the shared Pod/Quarter/Sprint **and** the current tab's extras.

### 6.4 Sprint dropdown stability

When a specific sprint is selected, the normal response only contains that sprint, which
would collapse the dropdown to one option. To prevent that, `page.tsx` fires a second
parallel request with `sprintId: "all"` and uses its `sprints` list for the dropdown:

```ts
const [data, allSprints] = await Promise.all([
  fetchDashboardData({ ...base, sprintId: effectiveSprint }),
  effectiveSprint === "all" ? Promise.resolve(null) : fetchDashboardData({ ...base, sprintId: "all" }),
]);
setSprintOptions((allSprints ?? data).sprints);
```

### 6.5 What each filter actually does

| Filter | Applied where | Matching rule |
|---|---|---|
| Pod | `metricsEngine` | `item.podKey === podId` (podKey is the Jira **project key** in local mode) |
| Quarter | `metricsEngine` | `item.quarter === quarterId` |
| Sprint | `metricsEngine` | case-insensitive fuzzy match against each sprint name on the issue (`matchesSprint`) |
| Developer | Developer tab only | `issue.assignee === selected name` |
| Status | Diagnosis tab only | `unfinishedIssue.status === selected status` |
| Window | Trends tab only | last N points of the already-computed series (3/5/8) |

> **Window caveat:** the backend only computes the latest `JIRA_SPRINT_WINDOW` sprints
> (default 5). Choosing “Last 8 sprints” in Trends cannot show more than those 5 unless
> `JIRA_SPRINT_WINDOW` is raised.

### 6.6 Dropdown options are portfolio-wide

`derivePods(items)` and `deriveQuarters(items)` are computed from **all** fetched issues,
not from the current filter. Their subtitles (“N issues”) are global counts. The selected
value is what narrows the data, not the option list.

Sprint options, in contrast, come from the **scoped** data (`activeItems`), so they reflect
the selected pod/quarter.

---

## 7. Tabs, cards, and what each popup shows

Every popup uses data already present in `dashboardData.issueList`. Clicking a card never
navigates to another tab and never triggers a new Jira request.

### 7.1 Executive Summary

- Four `MetricCard`s from `dashboardData.metrics`.
- `VelocityGrid` charts.

`openMetricCard` in `src/app/page.tsx:147` maps each card to a subset:

| Card | Popup issue list | Popup subtitle |
|---|---|---|
| Say/Do Ratio | all issues in scope | “Committed work items (done vs open)” |
| Sprint Carry Over | `!isDone` | “Unfinished / spilled-over committed work” |
| Team/Epic Velocity | `isDone` | “Completed work items” |
| Future Predictability | open features with a due date | “Planned features vs due-date forecast” |

The subtitle also appends the current scope, e.g. `CRM · CY26 PI.3 · Iteration 2`.
`scopeLabel` is built from the selected pod/quarter/sprint names and drops names starting
with “All”.

Executive popups also receive `dashboardData.metricInsights[card.title]`, so they show the
actual numerator/denominator, the latest-vs-previous sprint comparison, the target, the
last three sprints, and plain-language takeaways. The trend on the card itself is the
latest plotted sprint compared with the one before it, and its label names that sprint
(e.g. `Iteration 4 vs Iteration 3`).

### 7.2 Pod View (`PodTab`)

Four stat cards plus work-type and status rows. All open `IssuesModal`:

| Element | Popup issues |
|---|---|
| Total Work Items | all |
| Completed (Done) | `isDone` |
| In Flight | `!isDone` |
| Defect Density | `workType === "Bug"` |
| Work-type row | matching `workType` |
| Status row | matching `status` |

### 7.3 Developer View (`DeveloperTab`)

Cards and table rows open `IssuesModal`. The Developer filter scopes both the cards and
the table:

| Element | Popup issues |
|---|---|
| Active Developers | all issues (or selected developer only) |
| Avg SP / Developer | `isDone` (selected developer only) |
| Total Delivered | `isDone` (selected developer only) |
| Top Contributor | issues assigned to the top developer |
| Table row | issues assigned to that developer |

### 7.4 Sprint Analysis (`SprintAnalysisTab`)

| Element | Popup issues |
|---|---|
| Sprint Scope Churn (N/A) | all |
| Planned Work Share | all |
| Avg Cycle Time (N/A) | `isDone` |
| Avg Lead Time | `isDone` |
| Work-type row | matching `workType` |
| Status row | matching `status` |

### 7.5 Quality (`QualityTab`)

| Element | Popup issues |
|---|---|
| Defect Density | all bugs |
| Bug Resolution Rate | all bugs |
| Resolution Time | resolved bugs only |
| Active Defects | unresolved bugs |
| Priority row | all issues with that priority |

> The priority section is labelled “Defect Severity”, but the data counts **all work items**
> by priority, not only bugs. See [Known limitations](#17-known-limitations-and-parity-gaps).

### 7.6 Predictability (`PredictabilityTab`)

Cards do **not** open issue lists. They open `DetailModal` with the iteration history table
(planned, delivered, Say/Do) for the current scope. The same table is also shown on the
page.

### 7.7 Delivery Diagnosis (`DiagnosisTab`)

| Element | Popup |
|---|---|
| Slippage Volume | unfinished issues (status-filtered) |
| Primary Driver | unfinished issues whose computed `reason` equals the driver |
| Contributors with Spillover | unfinished issues (status-filtered) |
| Unfinished Work Items | unfinished issues (status-filtered) |
| Contributor row | custom popup listing that contributor's unfinished issues + reason |
| Bottom table | full status-filtered unfinished list |

The Status filter applies to the cards and the bottom table.

### 7.8 Trends (`TrendsTab`)

Cards open `DetailModal` with the series table, not issue rows:

| Card | Popup content |
|---|---|
| Peak Velocity | sprint, velocity, moving average |
| Rolling Velocity | same velocity table |
| Cumulative Throughput | sprint, total items, completed items |
| Throughput Momentum | same cumulative table |

The Window filter slices the series before rendering (last 3/5/8 points).

### 7.9 Issues (`IssuesTab`)

Full explorer with client-side search (key, summary, assignee), type filter, status filter,
and 25-row pagination. Jira keys link to `${jiraBaseUrl}/browse/${key}`.

---

## 8. How popups work

Two components, deliberately small and generic.

### 8.1 `DetailModal`

`src/components/DetailModal.tsx`

Props:

```ts
{
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;   // max-w-5xl instead of max-w-3xl
}
```

Behavior:

- Fixed overlay with a dimmed backdrop.
- Clicking the backdrop or pressing **Escape** closes it.
- Locks page scrolling while open and restores the previous value on close.
- Header shows title/subtitle and a close button.
- Body scrolls independently, capped at 85% viewport height.

There is **no focus trap** today; keyboard focus can leave the dialog. Add one if the app
must meet strict accessibility requirements.

### 8.2 `IssuesModal`

`src/components/IssuesModal.tsx`

Props:

```ts
{
  title: string;
  subtitle?: string;
  issues: IssueRow[];
  jiraDomain?: string;
  onClose: () => void;
  emptyText?: string;
  insight?: MetricInsight;   // optional rich explanation
}
```

Behavior:

- Wraps `DetailModal` in wide mode.
- **Explanation panel** (always present):
  - *What this means* — plain-language definition, formula, and actual calculation
    (e.g. `511 SP done ÷ 1,811 SP committed = 28%`).
  - *Current vs previous* — delta in `pp`, `%`, or `SP`, with both sprint names and an
    improving/worsening verdict.
  - *Target* — benchmark, current value, progress bar, on/outside target.
  - *How to compare* — what to look at next.
  - *Recent sprints* — up to three comparison rows.
  - *Takeaways* — two or three concrete observations.
- If no `insight` is passed, `getMetricDefinition(title)` supplies a definition for every
  known card title. Unknown titles get a generic definition, so no popup is blank.
- **Summary strip** — total items, SP, done, open, completion %, delivered SP.
- **In-popup filters** — search, all/open/done, status, type, assignee, sprint, reason
  (when present), sort, reset. Filtering is client-side; the count line shows “Showing X
  of Y items · Z SP”.
- Table columns: Key, Type, Summary (+ pod name), Status, SP, Assignee, Sprint, plus a
  Reason column when any row has `issue.reason`.
- Status pill is green when `issue.isDone`, blue otherwise.
- Key links to `${jiraDomain}/browse/${issue.key}` in a new tab.
- Empty state text defaults to “No work items for this selection.”

### 8.3 The `IssueRow` contract

```ts
interface IssueRow {
  key: string;
  summary: string;
  workType: string;
  status: string;
  storyPoints: number;
  podKey: string;
  podName: string;
  sprint: string;      // comma-joined sprint names, or "Backlog"
  assignee: string;
  priority: string;
  createdDate: string;
  isDone: boolean;
  reason?: string;     // used by Delivery Diagnosis popups
}
```

Any new card popup should pass a filtered `IssueRow[]` and let `IssuesModal` do the rest.
Executive cards also pass `dashboardData.metricInsights[title]`, which is computed in
`metricsEngine.ts` and contains the real numbers, trend, target, recent sprints, and
takeaways.

### 8.4 Metric definitions

`src/lib/jira/metricDefinitions.ts` maps card titles to plain-language explanations.
It is the fallback for every tab popup:

```ts
getMetricDefinition("In Flight")
// { what: "Work items that are not done yet.", howToCompare: "..." }
```

Add an entry there when adding a new card title that deserves its own explanation.

### 8.5 Pattern for adding a new clickable card

```tsx
const [modal, setModal] = useState<{ title: string; subtitle: string; issues: IssueRow[] } | null>(null);

<button type="button" onClick={() => setModal({
  title: "My Metric",
  subtitle: "What this list represents",
  issues: issues.filter(/* the exact subset */),
})}>
  …card content…
</button>

{modal && (
  <IssuesModal
    title={modal.title}
    subtitle={modal.subtitle}
    issues={modal.issues}
    jiraDomain={jiraDomain}
    onClose={() => setModal(null)}
  />
)}
```

Rules of thumb:

1. The popup list must be derivable from the **same filter scope** as the displayed number.
2. If the tab has an extra filter (developer/status), apply it before opening the popup.
3. Never fetch again just to open a popup.

---

## 9. Metrics: exact rules and formulas

All of this lives in `src/lib/jira/metricsEngine.ts`. The function is pure: same items +
filters ⇒ same output.

### 9.1 Definitions used everywhere

- **Done** — `item.status` is in `JIRA_DONE_STATUSES`. Matching is **exact and
  case-sensitive**. Default set:
  `Done, Accepted, Released, Closed, Resolved`.
- **Committed SP** — sum of story points of the scoped items (see caveat below).
- **Done SP** — sum of story points of scoped items whose status is done.
- **Carried SP** — committed − done (never below zero).
- **Planned SP** — in this codebase, planned equals committed. Jira does not expose the
  original sprint commitment after scope changes, so “planned” is the current sprint scope.

### 9.2 Scope

```
scopedItems  = all items where pod matches AND quarter matches
activeItems  = scopedItems where sprint matches (or all)
```

Everything below is computed from `activeItems`, except the dropdown option lists, which
use all items.

### 9.3 Summary

```ts
totalIssues          = activeItems.length
completedIssues      = count(isDone)
inProgressIssues     = totalIssues - completedIssues
totalStoryPoints     = round(sum(SP))
completedStoryPoints = round(sum(SP where done))
```

### 9.4 Executive KPI cards

For **All Sprints**, totals are de-duplicated (`summary`), so an issue that appears in
multiple sprints is counted once.

For **one specific sprint**, the totals come from that sprint's stats.

| Card | Formula | Trend | Color rule |
|---|---|---|---|
| Say/Do Ratio | `doneSP / committedSP × 100` | percentage-point change: latest plotted sprint vs the one before it | ≥80 green, ≥65 blue, else red |
| Sprint Carry Over | `carriedSP / committedSP × 100` | percentage-point change: latest plotted sprint vs the one before it | ≤18 green, ≤28 blue, else red |
| Team/Epic Velocity | `doneSP` (points) | % change: latest plotted sprint vs the one before it | always blue |
| Future Predictability | on-time-forecast features / planned features (future due dates) × 100 | none — due-date forecast, not sprint-trended | ≥85 green, ≥50 blue, else red |

**Future Predictability math** (different from Say/Do):

- Planned features = open (not done) features with a due date on or after today.
  If the site has no `Feature` issue type, `Epic` is used instead.
- On time = the feature's remaining story points fit inside the days remaining until
  its due date at the team's average delivery rate (completed SP over the last 30 days
  ÷ 30). Past-due open features are excluded from the score and listed as `Past Due`.
- Example: 8 planned features, 6 forecast on time → 75%.

The trend is **not** hard-coded to zero for All Sprints. It compares the latest sprint
in the window with the sprint before it, even when the card value aggregates the whole
selection. The label names both sprints (e.g. `Iteration 4 vs Iteration 3`). If there is no
previous sprint in the data, the trend is `0` and the label says `no previous sprint`.

Notes:

- Future Predictability is a **forward-looking due-date forecast** and shares no math
  with Say/Do, which is a retrospective delivered/committed ratio.
- `MetricCard.trendGood` controls whether an increase is good (`up`) or bad (`down`).
  Carry Over uses `down`.
- `MetricCard` also receives a legacy `drilldownTab`, but the page now always passes
  `onOpen`; clicking opens a popup, not a tab.

### 9.5 Sprint window and ordering

- Sprint names come from the Sprint field (array or comma-separated string).
- Observed sprints are those with at least one item in the current scope.
- Ordering uses a numeric key derived from year/quarter/PI/iteration in the name; if that
  fails, the sprint start date; if that fails, the iteration number.
- Only the latest `JIRA_SPRINT_WINDOW` sprints are plotted (default 5).
- Upcoming sprints are hidden unless the active sprint ends within
  `JIRA_NEXT_SPRINT_REVEAL_DAYS` (default 5).
- Sprint state is judged by **dates first**, then Jira state. This avoids a real bug where
  Jira reports an already-running sprint as `state: "future"`.
- Display names strip prefixes: `"DTR 2026 - Q4 - Iteration 2"` → `"Iteration 2"`.

Per-sprint `committed`/`done`/`carried` are sums over items that match that sprint. If an
issue is carried across sprints, it is counted in each sprint it appears in. That is correct
for per-sprint charts but would overcount a portfolio total — which is why the executive
cards use the de-duplicated `summary` totals for All Sprints.

### 9.6 Velocity and delivery charts

`VelocityChartData`:

- `completed` = done SP per sprint
- `committed` = committed SP per sprint
- `totalFinished` = sum of `completed` in the window
- `avgLastThree` = average of the last up-to-3 completed values
- `trendStatus` = last vs previous (`rising` / `falling` / `stable`)

`VelocityGrid.tsx` draws:

- Done SP bars.
- A **trailing 3-sprint moving average** line, computed in the component:
  `completed.slice(max(0, i-2), i+1)`.

`DeliveryChartData` is Committed / Done / Carried per sprint.

### 9.7 Developer stats

Group `activeItems` by assignee:

- `assignedIssues`, `totalSP`
- `completedIssues`, `deliveredSP`
- `completionRate = deliveredSP / totalSP × 100`
- sorted by `deliveredSP` descending
- unassigned issues are grouped under `"Unassigned"`

### 9.8 Sprint Analysis

| Metric | Rule |
|---|---|
| Planned Work % | SP created **on or before** the active sprint start ÷ total SP |
| Unplanned Work % | `100 − planned` (0 when planned is 0) |
| Avg Lead Time | average `(resolutionDate − createdDate)` in days for done items that have both dates |
| Avg Cycle Time | `0` / N/A — needs In-Progress→Done changelog |
| Scope Churn % | `0` / N/A — needs changelog |
| Work type breakdown | count + SP per `issuetype.name` |
| Status breakdown | count per status + color (done green, progress/review blue, test amber, other grey) |

If no active sprint start date is known, all SP is treated as planned.

### 9.9 Quality

- Bugs = `workType === "Bug"`.
- `defectDensity = bugs / completedStoryPoints × 100` (displayed as “per 100 delivered SP”).
- `resolutionRate = resolvedBugs / totalBugs × 100`.
- `avgResolutionDays` = average `(resolutionDate − createdDate)` for **resolved bugs only**.
- `priorityDistribution` = count of **all active items** per priority (not only bugs).

### 9.10 Predictability

- `score = doneSP / committedSP × 100`
- `varianceSP = |committedSP − doneSP|`
- `epicsOnSchedule = score` (same number today)
- `history` = one row per sprint in the window: planned, delivered, Say/Do

### 9.11 Trends

- `velocityTrend.velocity` = done SP per sprint.
- `velocityTrend.movingAvg` = **expanding average** (mean of all points up to index `i`),
  computed in `metricsEngine`.
- `cumulativeThroughput.totalIssues` = running sum of issue counts per sprint.
- `cumulativeThroughput.completedIssues` = running sum of done issue counts per sprint.

> Two different “moving averages” exist: the Executive velocity chart uses a **trailing
> 3-sprint** average; the Trends chart uses the **expanding** average from the data object.

### 9.12 Delivery Diagnosis

For each unfinished item, `getReason` picks the first matching rule:

1. `workType === "Bug"` → “Defect / Unresolved Bug”
2. SP ≥ 8 → “High Complexity Scope (8+ SP)”
3. status matches review/QA/test → “Review / QA Pipeline Delay”
4. status matches progress/development → “In-Progress Bottleneck”
5. status matches todo/backlog/ready/selected/pending → “Delayed Start / Backlog Delay”
6. otherwise → “Carried-Over Scope”

Other fields:

- `slippageSP = totalSP − doneSP`
- `slippagePct = slippageSP / totalSP × 100`
- `primaryDriver` = most frequent reason (ties: first encountered)
- `contributors` = assignees with `incompleteSP > 0`, each with their most frequent reason,
  sorted by incomplete SP
- `atRiskContributorsCount = contributors.length`
- `unfinishedIssues` = all unfinished items, sorted by SP descending

### 9.13 Issue list

`issueList` contains **every** active item (no cap), mapped to `IssueRow` with
`isDone = DONE_STATUSES.has(status)`. This is the dataset behind every issue popup and the
Issues tab.

---

## 10. Jira mapping rules

Implemented in `src/lib/jira/jiraService.ts` (local) and `forge/src/index.ts` (Forge).

### 10.1 Fetching

- Endpoint: `POST /rest/api/3/search/jql`
- Auth: Basic (`email:apiToken` base64) in local mode; `api.asApp()` in Forge.
- Pagination: `nextPageToken` until absent (local max 50 pages).
- Requested fields: `summary`, `status`, `issuetype`, `project`, `parent`, `assignee`,
  `priority`, `created`, `resolutiondate`, plus the configured SP, Sprint, and POD fields.
- `cache: "no-store"` on the local fetch.

The legacy `GET /rest/api/3/search` endpoint is deprecated and returns `410 Gone`. Do not
use it.

### 10.2 Field extraction

| Dashboard concept | Source | Notes |
|---|---|---|
| `podKey` | `fields.project.key` | This is what the Pod filter compares against in local mode |
| `podName` | POD custom field (string or `{ value }`), else project name | Empty POD field ⇒ project name |
| `workType` | `fields.issuetype.name` | “Bug” drives quality metrics |
| `status` | `fields.status.name` | Exact match against done statuses |
| `storyPoints` | configured SP field | Number or numeric string |
| `sprints` | configured Sprint field | Array of objects or comma string; split on commas |
| `quarter` | derived from the **last** sprint name on the issue | `"All"` if no recognizable pattern |
| `assignee` | `fields.assignee.displayName` | `"Unassigned"` if missing |
| `priority` | `fields.priority.name` | `"Medium"` if missing |
| `createdDate` | `fields.created` | ISO string |
| `resolutionDate` | `fields.resolutiondate` | ISO string or undefined |

### 10.3 Quarter patterns

`quarterFromSprint` recognizes:

| Sprint name | Quarter |
|---|---|
| `2026-Q3 Iteration 1` | `CY26 PI.3` |
| `DTR 2026 - Q4 - Iteration 2` | `CY26 PI.4` |
| `CY26 PI.3 Sprint 1` | `CY26 PI.3` |
| anything else | `All` |

Quarter dropdown order is numeric (`CY26 PI.3` before `CY26 PI.4`).

### 10.4 Sprint matching

`matchesSprint` is intentionally forgiving:

```ts
target = "iteration 2"
itemSprint = "dtr 2026 - q4 - iteration 2"
// matches because itemSprint.includes(target)
```

It compares trimmed lowercase strings and accepts either direction of `includes`.

Forge mode uses exact `Array.includes()` instead of the fuzzy match. Keep this in mind when
comparing local and Forge behavior.

### 10.5 Pods with no POD field

If the POD custom field is empty on every issue (common when the field exists but is not on
the issue screen), `podName` falls back to the project name and `podKey` remains the project
key. The dashboard then behaves as a project-level dashboard: one “pod” per Jira project.

---

## 11. Caching and refresh behavior

Local mode:

- Raw `JiraWorkItem[]` and `sprintMeta` are cached in module memory.
- TTL: `JIRA_CACHE_TTL_MS`, default `300000` ms (5 minutes).
- First request downloads everything (can take several seconds for ~1000 issues).
- Later filter changes reuse the cache and respond in ~0.1 s.
- Cache is per Node.js process. Restarting `pnpm dev` clears it. Multiple serverless
  instances each keep their own cache.
- The browser always calls `cache: "no-store"`; freshness is controlled by the server cache.

Forge mode:

- No in-memory cache today. Each `getDashboardData` invoke performs a Jira search.
- Filtering happens after download, so changing filters refetches from Jira.

To force a refresh locally, wait for the TTL or restart the dev server.

---

## 12. API contract

### 12.1 `GET /api/jira`

Localhost/standalone only.

Query parameters:

| Name | Default | Meaning |
|---|---|---|
| `pod` | `all` | Project key, or `all` |
| `quarter` | `all` | Quarter id like `CY26 PI.3`, or `all` |
| `sprint` | `all` | Full sprint name, or `all` |

Response: `DashboardData` (see below). Errors return HTTP 500 with
`{ error, details }`.

In a Forge build, this route is replaced by a static 404 stub and is never called.

### 12.2 `DashboardData` shape

```ts
{
  pods: PodOption[];
  quarters: QuarterOption[];
  sprints: SprintOption[];
  metrics: MetricCardData[];
  velocity: VelocityChartData;
  delivery: DeliveryChartData;
  summary: FilterSummary;
  developers: DeveloperStat[];
  sprintAnalysis: SprintAnalysisData;
  quality: QualityData;
  predictability: PredictabilityData;
  trends: TrendsData;
  diagnosis: DiagnosisData;
  issueList: IssueRow[];
  metricInsights?: Record<string, MetricInsight>;
  jiraBaseUrl?: string;
}
```

Important details:

- `pods[0]` is always `{ id: "all", name: "All Pods" }`.
- `quarters[0]` is always `{ id: "all", name: "All Quarters" }`.
- `sprints[0]` is always `{ id: "all", name: "All Sprints" }`.
- Sprint option `id` is the **full** Jira sprint name; `name` is the display name;
  `sub` lists teams that own that sprint.
- `jiraBaseUrl` is `JIRA_HOST` without a trailing slash, used to build browse links.

### 12.3 Forge resolver calls

| Call | Payload | Result |
|---|---|---|
| `getDashboardData` | `{ podId, quarterId, sprintId }` | Dashboard data |
| `getEvidence` | `{ issueKey }` | Single issue summary/status/dates/URL |
| `getAdminConfig` | none | Current JQL + field ids |
| `saveAdminConfig` | `{ jql, storyPointsField, sprintField, podField }` | `{ success: true }` |

Forge config is stored in Forge key-value storage and read by `getFieldConfig()` in
`forge/src/index.ts`. Defaults exist in code, so the app works without admin setup.

---

## 13. Forge deployment

### 13.1 How the static build works

Forge Custom UI requires a static bundle. `scripts/build-forge.mjs`:

1. Backs up `src/app/api/jira/route.ts`.
2. Replaces it with a `force-static` 404 stub.
3. Runs `next build` with `FORGE_BUILD=true`, which sets `output: "export"` in
   `next.config.ts`.
4. Writes the bundle to `./out`.
5. Copies the bundle to `./forge/out`.
6. Restores the original API route (even if the build fails).

The Forge manifest points `dashboard-ui` and `admin-ui` at `out` (inside `forge/`).

### 13.2 Build

```bash
pnpm run build:forge
```

Verify `out/` contains `index.html` and static assets.

### 13.3 Configure the Forge app

Set variables in the Forge environment (values live in Atlassian, not in git):

```bash
cd forge
forge login
forge variables set JIRA_HOST https://your-site.atlassian.net
forge variables set JIRA_JQL "project in (ABC)"
forge variables set JIRA_STORY_POINTS_FIELD customfield_10031
forge variables set JIRA_SPRINT_FIELD customfield_10020
forge variables set JIRA_POD_FIELD customfield_10050
forge variables set JIRA_DONE_STATUSES "Done,Accepted,Released,Closed,Resolved"
```

Variables are per environment. `forge deploy`/`forge install` default to the
`development` environment. For production, add `-e production` to each command.

`JIRA_HOST` is required for browse links. The resolver does **not** use email/token
variables; Forge authenticates with `api.asApp()`.

You can also set the JQL and field ids at runtime through the admin resolver
(`saveAdminConfig`), which stores them in Forge storage and overrides the code defaults.

### 13.4 Deploy and install

```bash
cd forge
forge lint
forge deploy
forge install
```

For production:

```bash
forge variables set -e production JIRA_HOST https://your-site.atlassian.net
# ...repeat the other variables with -e production
forge deploy -e production
forge install -e production
```

After later code changes: `pnpm run build:forge`, then `forge deploy` and
`forge install --upgrade`.

`forge install` lets you choose the Jira site and whether to install globally or per
project. The app appears as the global page **Enterprise Delivery KPIs**.

### 13.5 Manifest summary

- `jira:globalPage` → dashboard UI (`../out`), resolver `dashboard-resolver`
- `jira:adminPage` → admin UI (also `../out`), resolver `admin-resolver`
- triggers/consumers/scheduled functions for future sync work
- `sql` module (MySQL) declared
- runtime: `nodejs22.x`
- scopes: read Jira work, users, sprints, boards, issue details, projects; `storage:app`

The event/sync/admin/storage directories are present but are **not required** for the
read-only dashboard. The SQL schema in `forge/sql/schema.sql` is optional and must be
provisioned separately (`forge sql run schema.sql`) before those modules are used.

---

## 14. Adapting this to another Jira site or dashboard

You can point the same code at a different Jira site, project set, or entirely different
portfolio without changing UI code. Only configuration (and occasionally naming rules)
changes.

### 14.1 Step-by-step

1. **Copy the environment file**
   ```bash
   cp .env.example .env.local
   ```

2. **Set the Jira site and credentials**
   ```bash
   JIRA_HOST=https://new-site.atlassian.net
   JIRA_EMAIL=you@example.com
   JIRA_API_TOKEN=...
   ```

3. **Confirm authentication**
   ```bash
   curl -u "$JIRA_EMAIL:$JIRA_API_TOKEN" "$JIRA_HOST/rest/api/3/myself"
   ```
   If this fails, stop and fix the token before continuing.

4. **Discover custom fields and statuses**
   ```bash
   pnpm discover:fields
   pnpm probe
   ```
   Note which `customfield_*` holds Story Points, which holds Sprint, and which holds the
   POD/team. Also note the exact status names (case-sensitive).

5. **Set the data scope**
   ```bash
   JIRA_JQL=project in (ABC, DEF, GHI)
   ```
   Start broad; narrow later. The JQL is used verbatim.

6. **Set the field ids**
   ```bash
   JIRA_STORY_POINTS_FIELD=customfield_XXXXX
   JIRA_SPRINT_FIELD=customfield_XXXXX
   JIRA_POD_FIELD=customfield_XXXXX
   ```

7. **Set done statuses**
   ```bash
   JIRA_DONE_STATUSES=Done,Accepted,Released,Closed,Resolved
   ```
   Only these exact strings count as delivered. If your workflow uses “Complete” or
   “Deployed”, include them.

8. **Run and verify**
   ```bash
   pnpm dev
   ```
   Open the app, check the header count, then open each tab and click a card to confirm the
   popup list matches the card's scope.

9. **Adjust naming rules if needed**
   - Quarter parsing: `quarterFromSprint` in `src/lib/jira/jiraService.ts` (and the Forge
     copy in `forge/src/index.ts`).
   - Sprint display names: `sprintDisplayName` in `metricsEngine.ts`.
   - Sprint ordering: `sprintOrderKey` in `metricsEngine.ts`.
   Add a new regex branch if your sprint names use another pattern. Otherwise quarter
   values fall back to `All`.

10. **Decide how “pods” are represented**
    - Preferred: a custom field whose value is the pod/team name.
    - Fallback: one pod per Jira project (project key + project name).
    - If the custom field is empty, the dashboard automatically uses projects as pods.

### 14.2 What is generic vs site-specific

| Generic (no changes) | Site-specific (configure) |
|---|---|
| Tabs, cards, popups, charts | Jira host and token |
| Metrics formulas | JQL / project keys |
| Sprint matching, quarter sorting | Custom field ids |
| Pod/quarter derivation | Done status names |
| Local/Forge data layer | Sprint naming patterns (if unusual) |

### 14.3 Reusing the UI for a different kind of dashboard

The dashboard is effectively:

```
fetch → DashboardData → tabs
```

To build a different dashboard:

1. Define your own response type (or extend `DashboardData`).
2. Write a backend that returns it.
3. Point `fetchDashboardData` at that backend.
4. Reuse `DetailModal` / `IssuesModal` for any “show me the rows behind this number” popup.

The popup components only need `IssueRow[]`, so they work for any domain that can be
flattened into key/title/status/category/points/owner.

---

## 15. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Jira is not configured` | Missing `JIRA_HOST` or token | Fill `.env.local`, restart |
| HTTP 401/403 | Bad email/token, or token expired | Regenerate token; test `/rest/api/3/myself` |
| `/rest/api/3/field` returns 200 but no custom fields | Invalid token | Fix auth first |
| HTTP 410 | Using deprecated `GET /search` | Use `POST /rest/api/3/search/jql` |
| Empty dashboard | JQL matches nothing, or done statuses wrong | Run the JQL in Jira; check status names |
| All sprints hidden | Upcoming filter | Check sprint dates; raise `JIRA_NEXT_SPRINT_REVEAL_DAYS` |
| Sprint dropdown collapses | No parallel all-sprints fetch | Keep the two-request logic in `page.tsx` |
| Card number ≠ popup total | Card counts SP, popup counts items; or extra filter not applied | Compare units; apply tab filter before opening |
| Popup links point nowhere | `JIRA_HOST` unset or wrong | Set it in `.env.local` / Forge variables |
| Dev server shows stale code | Old Next process still bound to the port | Kill all Next processes and use a fresh port |
| Next fails to start after copying `node_modules` | OS-specific SWC binary | Delete `node_modules`, reinstall in the current OS |
| Forge build fails on `/api/jira` | Route not statically exportable | Use `pnpm run build:forge`, not `next build` |
| Forge page loads but data fails | Bridge invoke failed, fell back to `/api/jira` (404 in export) | Check resolver logs, Forge variables, scopes |

---

## 16. Verification checklist

After any change:

```bash
# TypeScript (root)
node_modules/typescript/bin/tsc --noEmit

# TypeScript (Forge backend)
cd forge && node node_modules/typescript/bin/tsc --noEmit

# Lint
node node_modules/eslint/bin/eslint.js src

# Local production build
pnpm build

# Forge static bundle
pnpm run build:forge
```

Runtime checks:

1. `GET /api/jira?pod=all&quarter=all&sprint=all` returns data.
2. Header count equals `summary.totalIssues`.
3. `issueList.length` equals `summary.totalIssues` (for All Sprints).
4. Executive Say/Do equals `completedStoryPoints / totalStoryPoints`.
5. Clicking each Executive card opens a popup whose count/SP match the card's definition.
6. Each tab's cards open popups; closing via Escape and backdrop works.
7. Jira key links open the correct issue.
8. Selecting a specific sprint keeps the sprint dropdown populated.
9. Changing Pod or Quarter resets Sprint.
10. Forge build leaves `src/app/api/jira/route.ts` restored with `force-dynamic`.

---

## 17. Known limitations and parity gaps

These are real today. Documenting them prevents future work from assuming behavior that
does not exist.

### 17.1 Metrics

- **Planned = committed.** Jira does not return the original commitment after scope
  changes, so planned/committed are the same number.
- **Cycle time and scope churn are N/A.** They require issue changelog data, which the
  dashboard does not fetch.
- **Future Predictability is a due-date forecast**, not the Say/Do ratio.
- **`epicsOnSchedule` equals the predictability score**; it is not a separate epic-level
  calculation.
- **Priority distribution is all issues**, not bugs only, despite the Quality section label.
- **Per-sprint sums can overcount carried work** because an issue can appear in several
  sprints. Executive All-Sprints totals use de-duplicated summary totals to avoid this.
- **Trends “moving average” is an expanding average**, unlike the trailing 3-sprint average
  in the Executive velocity chart.
- **Trends window is capped** by `JIRA_SPRINT_WINDOW` (default 5), so “Last 8” may show 5.

### 17.2 Forge parity

The Forge resolver is intentionally simpler than the local engine. Differences to be aware
of:

| Area | Local | Forge today |
|---|---|---|
| Developers tab | populated | `developers: []` |
| Sprint Analysis | planned/unplanned, lead time, breakdowns | mostly zeros/empty |
| Quality | full bug metrics | zeros |
| Diagnosis | contributors + reasons | minimal, reasons default to “Carried-Over Scope” |
| `issueList.isDone` | present | **missing** (status pills render as not done) |
| Quarter derivation | last sprint on issue | first sprint on issue |
| Pod key | Jira project key | POD field value (string) |
| Sprint filter | fuzzy match | exact `includes` |
| Caching | 5-minute in-memory | none |
| Upcoming-sprint filtering | date-aware | none |
| Sprint ordering/display | chronological + cleaned names | raw names, last 5 insertion order |

If full Forge parity is required, port the logic from `metricsEngine.ts` into
`forge/src/index.ts` (or a shared package) rather than duplicating small fixes ad hoc.

### 17.3 UI/architecture

- Filters are not in the URL, so views cannot be bookmarked or shared.
- **Pods are keyed by Jira project**, not by the POD field value. If one project contains
  multiple team values in the POD field, they collapse into a single pod (named after the
  first value encountered). To separate teams inside one project, change `derivePods` and
  the pod filter to key on the custom-field value instead of `podKey`.
- `DetailModal` has no focus trap.
- The Forge admin page points at the same static bundle as the dashboard; there is no
  dedicated admin UI component yet. The admin resolver exists and can be called.
- Forge event/sync/SQL modules are declared but not wired to the read-only dashboard. They
  require provisioning before use.
- The local cache is per process; serverless deployments may cold-start and refetch.

---

## 18. Glossary

| Term | Meaning |
|---|---|
| **SP** | Story Points |
| **PI** | Program Increment; mapped to a quarter (`CY26 PI.3`) |
| **Pod** | Team/service grouping. Custom field value, or Jira project as fallback |
| **Sprint window** | The latest N sprints shown in charts (default 5) |
| **Done** | Status present in `JIRA_DONE_STATUSES` (exact, case-sensitive) |
| **Carry over / spillover** | Committed SP not completed in the sprint |
| **Say/Do** | Done SP ÷ committed SP |
| **Predictability** | In this app, done SP ÷ planned (currently same as Say/Do) |
| **Deduplicated total** | Counting each issue once even if it appears in several sprints |
| **Forge** | Atlassian's serverless app platform; backend runs in Atlassian cloud |
| **Bridge** | `@forge/bridge`; lets the iframe call Forge resolvers |
| **Resolver** | Forge backend function registered with `@forge/resolver` |

---

## Appendix A — Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `JIRA_HOST` | yes | — | Jira site base URL; also used for browse links |
| `JIRA_EMAIL` | yes (local) | — | Basic auth email |
| `JIRA_API_TOKEN` | yes (local) | — | Basic auth token |
| `JIRA_JQL` | no | `project in (DTR)` | Issue scope |
| `JIRA_STORY_POINTS_FIELD` | no | `customfield_10031` (local) / `10078` (Forge) | Story Points field |
| `JIRA_SPRINT_FIELD` | no | `customfield_10020` | Sprint field |
| `JIRA_POD_FIELD` | no | `customfield_10050` (local) / `10001` (Forge) | POD/team field |
| `JIRA_DONE_STATUSES` | no | `Done,Accepted,Released,Closed,Resolved` | Done status names |
| `JIRA_CACHE_TTL_MS` | no | `300000` | Local raw-data cache TTL |
| `JIRA_SPRINT_WINDOW` | no | `5` | Number of sprints plotted |
| `JIRA_NEXT_SPRINT_REVEAL_DAYS` | no | `5` | When to reveal an upcoming sprint |
| `JIRA_DISCOVERY_ISSUE_TYPE` | no | `Story` | Sample issue type for discovery scripts |
| `NEXT_PUBLIC_API_BASE_URL` | no | empty | Prefix for `/api/jira` calls |
| `FORGE_BUILD` | no | unset | Set to `true` by the build script for static export |

> The default field ids are only fallbacks. Always discover and set the ids for the target
> Jira site.

## Appendix B — Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Start Next.js dev server |
| `pnpm build` | Production build (server + API route) |
| `pnpm run build:forge` | Static export into `./out` for Forge |
| `pnpm lint` | ESLint |
| `pnpm discover:fields` | List custom fields, sample values, statuses |
| `pnpm probe` | Identify SP/POD fields and done statuses |
| `node_modules/typescript/bin/tsc --noEmit` | Typecheck the app |
| `cd forge && node node_modules/typescript/bin/tsc --noEmit` | Typecheck the Forge backend |
| `forge deploy` | Deploy the Forge app |
| `forge install` | Install the Forge app into a Jira site |

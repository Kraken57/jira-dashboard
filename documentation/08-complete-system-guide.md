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
- It renders seven tabs (Executive, Pod, Developer, Quality, Predictability,
  Delivery Diagnosis, Issues).
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
JIRA_SUBTASK_DONE_STATUSES=Done,Closed,Resolved,Completed,Released,Accepted
```

#### 3.3.1 QA team variables (Quality tab) — localhost

The Quality tab's QA section reads these from `.env.local`. They are **names and
settings, not secrets**. Restart `pnpm dev` after editing them.

```bash
JIRA_QA_DEFECT_JQL=(project in (ABC)) AND issuetype = Bug
JIRA_QA_UAT_DEFECT_JQL=(project in (ABC)) AND issuetype = Bug AND labels = uat
JIRA_QA_LEAKAGE_DEFECT_JQL=(project in (ABC)) AND issuetype = Bug AND labels = escaped
JIRA_QA_MEMBERS=Sandeep Annaldas,Arun Aare,Naman Goel,Anantha Garapati,Roja PS,Sahaj Arora,Durga Sridhar Kaligotla
JIRA_QA_CAPACITY_HOURS_PER_WEEK=40
JIRA_QA_TEST_ISSUE_TYPES=Test
JIRA_QA_SUPPORT_ISSUE_TYPES=Support
JIRA_ZAPI_PROJECT_KEYS=ENTQA
```

`JIRA_QA_DEFECT_JQL` is an optional, separate Jira REST query for the Quality tab's
QA Defects section. When empty, it defaults to `(${JIRA_JQL}) AND issuetype = Bug`.
Use the saved filter's JQL from the existing QA Jira dashboard when its scope, issue
types, or project set differs. This uses the regular Jira API token and requires issue
and reporter visibility; it does not depend on Zephyr authentication. The defects view
groups issues by Jira reporter and pod and supports pod/reporter filters and issue
drilldowns. Configure the same variable in Forge environment variables for Forge.
The optional UAT and leakage queries must encode reliable Jira workflow labels, fields,
or other site-specific criteria. When absent, their cards show N/A rather than implying
that the count is zero.

- `JIRA_QA_MEMBERS` is the always-visible roster. Names match Jira display names,
  ignoring case, spaces, dots and underscores.
- With no members configured, the Quality tab still renders the QA section and shows
  a message telling you what to add. It never silently hides the section.
- The QA tab has **its own filter** (a team dropdown inside the QA section). It does
  not use the shared pod/quarter/sprint bar.

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

### 5.1.1 Raw-feed mode (default since the caching rework)

The dashboard no longer fetches one `DashboardData` per filter click. It fetches
the **raw feed** once per 5-minute window and computes every filter/tab/popup in
the browser with the same pure `computeDashboardData` (the site's env rules —
done statuses, sprint window — travel inside the feed as `config`).

- Local: `GET /api/jira?raw=1` → `RawFeedPayload` (`items`, `sprintMeta`,
  `jiraBaseUrl`, `fetchedAt`, `config`, `source`, `ageMs`). The feed is cached
  in the gitignored disk file `.cache/jira-feed.json.deflate` (not RAM): fresh
  (≤5 min) is served instantly, stale (≤30 min) is served instantly and
  refreshed in the background, older blocks on one live fetch.
- Forge: `invoke("getRawFeed")` — same contract, cached in Jira app storage via
  the supported `@forge/kvs` SDK (zlib-deflated, chunked under
  `raw-feed-v1-part-*` with commit marker `raw-feed-v1-meta`; values sit well
  inside the documented 240 KiB per-value and 4,000 r/w-per-minute limits).
- The browser mirrors the feed in `sessionStorage` (`jira-raw-feed-v1`, tab
  scope, wiped on tab close), so page refresh renders instantly and
  revalidates quietly. The header chip shows the snapshot age and whether a
  background refresh is running.
- The per-filter `GET /api/jira?pod=…` path and the Forge
  `getDashboardData` resolver remain as untouched fallbacks.

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
| Quality | Pod, Quarter, Sprint |
| Predictability | Pod, Quarter |
| Delivery Diagnosis | Pod, Quarter, Sprint, **Status** |
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

### 6.6 Dropdown options are portfolio-wide

`derivePods(items)` and `deriveQuarters(items)` are computed from **all** fetched issues,
not from the current filter. Their subtitles (“N issues”) are global counts. The selected
value is what narrows the data, not the option list.

Sprint options, in contrast, come from the **scoped** data (`activeItems`), so they reflect
the selected pod/quarter.

For dated sprints, the common sprint grouping uses Jira's start/end dates.
An unnamed sprint joins a PI when its date range matches a sprint whose name
identifies that PI. An issue's current quarter does not assign its historical
dated sprints to that PI. Local and Forge raw-feed fetches refresh unique sprint
IDs through `GET /rest/agile/1.0/sprint/{id}`, including closed sprints, in batches
of eight. Unreadable sprint details retain the issue-field metadata and log a
warning. This uses the configured Jira site; no board URL or date is hardcoded.
The common label preserves the Jira sprint/iteration number, including zero.
Within the same named PI and iteration, all board date ranges form one option.
Different PI labels or explicit iteration numbers remain separate even when
their dates coincide. Completion attribution and spillover ordering use the
original work item's sprint dates before mapping to the common option.
If selected pods have different timelines, the subtitle shows the real Jira
range closest to the selected source ranges, minimizing the sum of start/end
date differences weighted by source count. Ties prefer the most common range,
then the earliest range. A single selected pod uses its own source range.
This representative timeline does not replace source dates for completion
attribution or spillover calculations. Missing Jira dates show “Dates not set.”
Only sprints attached to fetched issues are included; empty board sprints are
not discovered by this path. PI membership comes from sprint names or a shared
dated sprint with a PI label; calendar dates alone cannot establish a fiscal PI.
Quarter options and issue scope include each mapped historical sprint quarter,
so moving a story into a newer PI does not hide its older PI's sprint history.
All pod selections use consistent common labels (Sprint 0, Sprint 1, etc.).
The shared Sprint Status selector sits between Quarter / PI and Sprint:
- All Sprints includes every lifecycle state (the default).
- Open Sprints includes Jira states `active` and `future`.
- Closed Sprints includes Jira state `closed`.
Unknown states appear only under All. State comes from Jira, rather than guessing
from dates. Lifecycle filtering applies to each source sprint before combining
work items, so one common sprint number can appear in both Open and Closed
views when its pods have different states. Each view includes only its matching
source work items.
Status filters both the sprint options and work-item scope across the shared
filter tabs, including audit cards. An item with both open and closed sprint
history can appear in either view, but is counted once within each view.
Changing status, pod, or quarter resets the sprint selection to All Sprints.
Reset restores all pods, quarters, statuses, and sprints. Quality retains its
separate QA filters and portfolio scope.
Shared dropdowns wrap full option names and date subtitles. The Quality sprint
filter uses the same wrapping dropdown instead of a clipped native select.

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
| Say/Do Ratio | `completedInScope` | “Accepted / completed committed work” |
| Sprint Carry Over | `carriedInScope` | “Not accepted / spilled-over committed work” |
| Velocity | `completedInScope` | “Completed work items” |
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

Four stat cards, a work-type selector, and a workflow pie chart:

| Element | Action |
|---|---|
| Total Features | opens `Feature` items (falls back to `Epic` when the site has no Feature type). Features follow the selected quarter/sprint through their own sprint or a linked child story (`parent` / Epic Link). Features with no sprint and no linked children appear only in All/All. |
| Total Stories | opens `workType === "Story"` |
| Completed Stories | opens stories with `isDone` |
| In Flight | opens stories with `!isDone` |
| Work-type row | selects that type and renders its workflow pie on the right |
| Pie slice / legend row | opens the matching `workType` + `status` issues |

The pie uses a fixed high-contrast palette so every status segment and its legend
marker stay distinguishable.

### 7.3 Developer View (`DeveloperTab`)

Cards and table rows open `IssuesModal`. The Developer filter scopes both the cards and
the table:

| Element | Popup issues |
|---|---|
| Active Contributors | Story + Sub-task items (or selected developer only) |
| Avg SP / Developer | completed Story + Sub-task items |
| Total Delivered | completed Story + Sub-task items |
| Table row | Story + Sub-task items assigned to that developer |

The table counts **Story + Task + Sub-task** and shows the split in each cell.
The table now has separate **Story Points** (`Delivered / Assigned`) and **Hours**
(`Completed / Original estimate`) columns, plus a team-total footer. Hours come from
Jira’s `timeoriginalestimate` or `timetracking.originalEstimateSeconds`, both in seconds, divided by 3600. The Jira display text (for example, `1d 2h`) is not parsed, so the site’s hours-per-day configuration is respected. Logged hours use `timespent`; completed estimate hours are not actual logged hours. Missing estimates are counted separately. Completion rate is completed items ÷ assigned items.
Developer rows are tinted **yellow above 70%** and **red at 70% or below**.

Sub-tasks inherit their parent story’s sprint/quarter when they have none of their own.
Sub-task completion also accepts `JIRA_SUBTASK_DONE_STATUSES` (default
`Done,Closed,Resolved,Completed,Released,Accepted`), because a site may only count
`Accepted` as done for stories.

The Developer popup adds an **Hours** column and hour totals. Each row shows the
original estimate and whether those hours are completed.

The Developer dropdown supports searching names without changing selections. Clicking a contributor opens an overview of assigned/completed/open work, story points, estimates, logged time and estimate coverage, followed by the same work-item list. These figures describe current assignees and the fetched filter scope, not historical authorship or remaining availability. A missing parent in the fetched Jira feed prevents subtask sprint/quarter inheritance; include parent issues in the configured JQL.

### 7.4 Quality (`QualityTab`)

The tab has two parts:

1. **QA Team Capacity & Workload** (top): every member in `JIRA_QA_MEMBERS` plus anyone
   assigned a Test-type issue. Columns: assigned, allocated hrs, supported hrs, available
   hrs, test cases, Zephyr executions, load bar. A team dropdown inside the section
   slices the view by pod. The tab ignores the shared pod/quarter/sprint filters.
2. **Defect metrics** (below): the original defect cards and priority distribution.

Zephyr sprint labels are resolved from Jira's Sprint field on each Zephyr test-case issue
and on Jira work items linked through Zephyr Traceability coverage. If the test-case list
has no embedded issue links, the integration follows its Zephyr `links.self` resource to
read the coverage links, then looks up those Jira issues separately from `JIRA_JQL`.
Zephyr test projects therefore do not need to be added to the main delivery scope. The
Jira account/app still needs permission to read the linked issues and their Sprint field;
otherwise cases remain “Backlog / no linked sprint”. Zephyr test-cycle names and the
Zephyr Iteration field are not treated as Jira sprints.

| Element | Popup issues |
|---|---|
| Defect Density | all bugs |
| Bug Resolution Rate | all bugs |
| Resolution Time | resolved bugs only |
| Active Defects | unresolved bugs |
| Priority row | all issues with that priority |

> The priority section is labelled “Defect Severity”, but the data counts **all work items**
> by priority, not only bugs. See [Known limitations](#17-known-limitations-and-parity-gaps).

### 7.5 Predictability (`PredictabilityTab`)

Cards do **not** open issue lists. They open `DetailModal` with the iteration history table
(planned, delivered, Say/Do) for the current scope. The same table is also shown on the
page.

### 7.6 Delivery Diagnosis (`DiagnosisTab`)

| Element | Popup |
|---|---|
| Slippage Volume | unfinished issues (status-filtered) |
| Primary Driver | unfinished issues whose computed `reason` equals the driver |
| Contributors with Spillover | unfinished issues (status-filtered) |
| Unfinished Work Items | unfinished issues (status-filtered) |
| Contributor row | custom popup listing that contributor's unfinished issues + reason |
| Bottom table | full status-filtered unfinished list |

The Status filter applies to the cards and the bottom table.

### 7.7 Executive trend charts (`TrendsCharts`)

Two read-only charts sit below Team Velocity and Sprint Delivery Overview on the
Executive Summary:

| Chart | Shows |
|---|---|
| Velocity Trajectory & Moving Average | Done SP per sprint plus the expanding moving average |
| Cumulative Throughput Growth | Running total of tracked items vs completed items |

There is no separate Trends tab.

### 7.8 Issues (`IssuesTab`)

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

JIRA_NEXT_SPRINT_REVEAL_DAYS=5
The Quality tab QA-capacity math reads these (documented in 09 as well):

```env
# ---- QA Team Capacity & Workload (Quality tab) ----
# Weekly capacity per member (default 40 = 8h x 5 days)
JIRA_QA_CAPACITY_HOURS_PER_WEEK=40
# Issue types Zephyr uses for test cases (comma-separated)
JIRA_QA_TEST_ISSUE_TYPES=Test
# Issue types counted as "supported load" (comma-separated)
JIRA_QA_SUPPORT_ISSUE_TYPES=Support
# Optional explicit QA member names, comma-separated (Jira displayName spelling).
# Leave empty to auto-detect members from assigned Test-type issues.
JIRA_QA_MEMBERS=
# Weekly capacity per member (default 40 = 8h x 5 days)
JIRA_QA_CAPACITY_HOURS_PER_WEEK=40
# Issue types Zephyr uses for test cases (comma-separated)
JIRA_QA_TEST_ISSUE_TYPES=Test
# Issue types counted as "supported load" (comma-separated)
JIRA_QA_SUPPORT_ISSUE_TYPES=Support
# Optional explicit QA member names, comma-separated (Jira displayName spelling).
# Leave empty to auto-detect members from assigned Test-type issues.
JIRA_QA_MEMBERS=
```

### 9.3 Summary

```ts
totalIssues          = activeItems.length
completedIssues      = count(isDone)
inProgressIssues     = totalIssues - completedIssues
totalStoryPoints     = round(sum(SP))
completedStoryPoints = round(sum(SP where done))
```

### 9.4 Executive KPI cards

Cards and charts use the same pod, PI, sprint lifecycle, and sprint selection.
Each work item contributes once to a card across selected sprints. Per-sprint
chart points preserve sprint membership, so carried work can belong to several
sprint commitments but completes in only one source sprint.

| Card | Formula |
|---|---|
| Say/Do Ratio | SP completed in the selected sprints / SP assigned to those sprints × 100 |
| Sprint Carry Over | SP not delivered in the selection and carried from a started source sprint / selected committed SP × 100 |
| Velocity | Combined SP completed in the selected sprints across selected pods; no global pod averaging |
| Feature Predictability | Uses the selected features and ancestors of selected work, with story delivery/due-date rules from `featureDelivery.ts` |

A future source sprint contributes assigned work, but no carryover before it
starts. Completed work attributed to an unselected sprint is not included in
selected-sprint velocity or Say/Do. Popup rows use the same `completedInScope`
and `carriedInScope` flags as the card numerators. Feature details retain the
full child-story rollup for each selected feature.

For one selected pod, a single selected sprint compares against its previous
available sprint in the pod/PI/lifecycle scope. Multiple selected sprints compare
the last two selected sprints. Combined pod views show totals without that
single-pod trend comparison.

These figures use current Jira estimates and resolution/sprint timestamps.
They do not reconstruct sprint-start commitments or historical statuses from
changelog snapshots. Missing timestamps retain the documented completion
fallback; exact historical Jira report parity is not guaranteed.

### 9.5 Sprint window and ordering

- Sprint names come from the Sprint field (array or comma-separated string).
- Observed sprints are those with at least one item in the current scope.
- Ordering uses a numeric key derived from year/quarter/PI/iteration in the name; if that
  fails, the sprint start date; if that fails, the iteration number.
- All Sprints plots every observed sprint in the selected pod/PI/lifecycle scope,
  including future sprints. The legacy recent-window and future-reveal limits
  do not hide sprints in the shared-filter charts.
- Explicit sprint selections plot exactly those available sprint groups.
- Labels use the common quarter and sprint number; source dates remain available
  for completion attribution and carryover ordering.

Per-sprint `committed` includes each item Jira lists in that sprint, preserving the
commitment across carry-over. A completed item contributes to `done` in only one sprint:
the sprint whose start/end dates contain Jira's `resolutionDate`. If the date falls outside
known sprint windows, the latest sprint that started before resolution is selected. When
Jira does not provide usable resolution/sprint dates, the item's last listed sprint is the
fallback. `carried` includes open items and items completed in a later sprint, so Sprint 0
records the carry-over while Sprint 1 receives the completion. Executive All-Sprints cards
continue to use de-duplicated summary totals.

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

Group Story + Sub-task items by assignee:

- `assignedIssues` / `completedIssues` (total Story + Sub-task)
- `assignedStories` / `assignedSubtasks` and completed counterparts
- `deliveredSP`, `totalSP`
- `originalEstimateHours` / `completedEstimateHours` from `timeoriginalestimate`
- `completionRate = completedIssues / assignedIssues × 100`
- sorted by `deliveredSP` descending
- unassigned issues are grouped under `"Unassigned"`

### 9.8 Sprint analysis data (Pod View)

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
- Quality-tab priority distribution counts QA defect issues by priority.
- The Quality tab's defect lifecycle cards use the dedicated QA defect query and pod/reporter scope: completed means a configured done status (or Done, Accepted, Released, Closed, Resolved, Completed); active excludes completed and canceled/rejected items.
- UAT count uses optional `JIRA_QA_UAT_DEFECT_JQL`. Defect leakage is distinct issues returned by optional `JIRA_QA_LEAKAGE_DEFECT_JQL` divided by distinct QA defect issues, times 100. With no query, the metric is N/A.
- Defect density is distinct QA bugs per 100 delivered story points for the selected pod scope; without delivered story points it is N/A.

### 9.10 Predictability

- `score = doneSP / committedSP × 100`
- `varianceSP = |committedSP − doneSP|`
- `epicsOnSchedule = futurePredictability.score` (forward-looking due-date forecast)
- `history` = one row per sprint in the window: planned, delivered, Say/Do

### 9.11 Executive trend charts

- `velocityTrend.velocity` = done SP per sprint.
- `velocityTrend.movingAvg` = **expanding average** (mean of all points up to index `i`),
  computed in `metricsEngine`.
- `cumulativeThroughput.totalIssues` = running sum of issue counts per sprint.
- `cumulativeThroughput.completedIssues` = running sum of done issue counts per sprint.

> Two different “moving averages” exist: the Executive velocity chart uses a **trailing
> 3-sprint** average; the Executive trend chart uses the **expanding** average from the data object.

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

`developerIssueList` is the Story + Sub-task subset used by Developer View. It includes
`originalEstimateHours` and `isSubtask`, and is the only list that keeps subtasks.

---

## 10. Jira mapping rules

Implemented in `src/lib/jira/jiraService.ts` (local) and `forge/src/index.ts` (Forge).

### 10.1 Fetching

- Endpoint: `POST /rest/api/3/search/jql`
- Auth: Basic (`email:apiToken` base64) in local mode; `api.asApp()` in Forge.
- Pagination: `nextPageToken` until absent (local max 50 pages).
- Requested fields: `summary`, `status`, `issuetype`, `project`, `parent`, `assignee`,
  `priority`, `created`, `resolutiondate`, `timeoriginalestimate`, plus the configured SP,
  Sprint, and POD fields.
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
| `originalEstimateSeconds` | `fields.timeoriginalestimate` | Jira seconds; converted to hours for Developer View |

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
  developerIssueList: IssueRow[];
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
- `jiraBaseUrl` is used to build Jira browse links. In Forge, the frontend replaces
  it with the installed site's `siteUrl` from `view.getContext()`; standalone mode
  continues to use `JIRA_HOST`.

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
3. Runs the installed Next.js build with `FORGE_BUILD=true`, which sets static
   export and a relative asset prefix in the canonical `next.config.mjs`.
4. Writes the bundle to `./out`.
5. Copies the bundle to `./forge/out`.
6. Restores the original API route, normalizes HTML/RSC asset paths for each
   file's directory, copies the bundle, and validates export and resource parity.
   Catchable interrupt signals also restore the route.

The Forge manifest points `dashboard-ui` and `admin-ui` at `out` (inside `forge/`).
The validator checks the resource mapping, inline content permissions, Tailwind
CSS output, Webpack runtime path, copied file parity, and restored local API route.

### 13.2 Build

```bash
pnpm run build:forge
```

The build uses Webpack on Next 16+ (`next build --webpack`) and the default
Webpack builder on Next 14/15. It normalizes markup/RSC references only; it
does not patch generated JavaScript. Run `pnpm run validate:forge` to recheck
the export and Forge resource. See the pre-deploy checklist and deployment audit
at the repository root for release gates and production acceptance steps.

### 13.3 Configure the Forge app

Run every Forge command from inside `forge/` (the CLI resolves `manifest.yml`
from the current directory — running it from the repo root fails).

```bash
cd forge
forge login     # opens a browser; click Allow once
forge whoami    # verifies the login
```

Variables use **separate key and value arguments** (no `KEY=value`, no line
continuations); the environment id comes from `-e`:

```bash
forge variables set -e development JIRA_HOST https://your-site.atlassian.net
forge variables set -e development JIRA_JQL "project in (ABC)"
forge variables set -e development JIRA_STORY_POINTS_FIELD customfield_10031
forge variables set -e development JIRA_SPRINT_FIELD customfield_10020
forge variables set -e development JIRA_POD_FIELD customfield_10050
forge variables set -e development JIRA_QA_UAT_DEFECT_JQL "YOUR_UAT_DEFECT_JQL"
forge variables set -e development JIRA_QA_LEAKAGE_DEFECT_JQL "YOUR_ESCAPED_DEFECT_JQL"
forge variables set -e development JIRA_DONE_STATUSES "Done,Accepted,Released,Closed,Resolved"
forge variables set -e development JIRA_SUBTASK_DONE_STATUSES "Done,Closed,Resolved,Completed,Released,Accepted"
forge variables list -e development   # verify
```

`forge deploy`/`forge install` default to the `development` environment. For
production, add `-e production` to each command and repeat the variable block.
Deployment-configuration precedence: saved admin-page value, then Forge
variables (`process.env`), then the code defaults.

`JIRA_HOST` is still used by the Forge resolver for Jira API URLs and as a fallback
for browse links. The frontend gets the installed site's URL from Forge context for
popup browse links. The resolver does **not** use email/token variables; Forge
authenticates with `api.asApp()`.

Two timing rules:

1. **Variables are baked into the deployed app version.** After changing any
   variable you must re-run `forge deploy` (the CLI prints the same tip) before
   the running app sees the new value.
2. You can also set the JQL/field ids at runtime through the admin resolver
   (`saveAdminConfig`), which stores them in Forge storage and overrides both
   variables and defaults.

### 13.4 Deploy and install

```bash
cd forge
pnpm install                                     # first time on a machine
pnpm run build:forge                             # from the repo root — refreshes forge/out
cd forge
forge lint                                       # compiles the app; fix errors before deploying
forge deploy --environment development --approve MAJOR_VERSION_RULE
forge install --site your-site.atlassian.net --product jira --environment development
```

- `--approve MAJOR_VERSION_RULE` acknowledges the major-version upgrade
  (scope modification) prompt the CLI otherwise refuses to continue on. When
  a deploy does not require an approval, plain `forge deploy` works.
- Installing on a **production Jira site from the development environment** is
  intentional for testing; the CLI prints a warning — answer `y` to proceed.
- If the app is **already installed** on the site, the install command fails
  with `already installed ... status COMPLETED`; that site needs an upgrade:
  ```bash
  forge install --upgrade --site your-site.atlassian.net --product jira --environment development
  ```
- Deploy messages: `Run forge install --upgrade` after `Detected new scopes`
  applies to existing installations — fresh installs pick the scopes up
  automatically.

For production:

```bash
forge variables set -e production JIRA_HOST https://your-site.atlassian.net
# ...repeat the other variables with -e production
forge deploy --environment production --approve MAJOR_VERSION_RULE
forge install --site your-site.atlassian.net --product jira --environment production
```

After later code changes: `pnpm run build:forge`, then `forge deploy` and
`forge install --upgrade` (only when scopes changed or the CLI says so).

The app appears as the global page **Enterprise Delivery KPIs** (Jira → Apps).

### 13.4.1 Deploy troubleshooting (all paths verified)

| Symptom | Cause | Fix |
|---|---|---|
| `Bundling failed: TypeScript emitted no output for <file>.ts` (packaging stage) | `tsconfig.json` carries `"noEmit": true`, which the CLI packager inherits | Never set `noEmit` in `forge/tsconfig.json`; the typecheck script already passes `--noEmit` on the command line |
| `ApplicationCompileError` with no details | App code imports something the platform compile service rejects (e.g. an SDK its bundler does not support yet) | Bisect: temporarily stub the import; `src/kvsClient.ts` is the documented facade pattern for this |
| `'variables set --environment' is not a Forge command` | Wrong argument form — key/value must be separate | `forge variables set -e development KEY value` |
| `manifest-file-required` | `forge` command run from the repo root | `cd forge` first |
| `Unsupported Node.js version` (CLI ≥15) | Forge CLI 15 needs Node ^22.23.4+ | Use `nvm use`/export a matching Node, or stay on CLI 14.2 (runs on Node 22.15+) |
| Tail says `major version upgrade ... approval` | Scope set changed between deploys | Append `--approve MAJOR_VERSION_RULE` once per change (it is remembered for that deploy only). |
| `Specified Version did not exist` (`VERSION_NOT_FOUND`) on every deploy | The environment's platform version contract is corrupted (seen after an interrupted `--major-version` deploy) | `forge deploy` normally still works for **minor** versions; if even those fail, comment the `trigger`, `scheduledTrigger`, and `consumer` blocks (plus their per-function `timeoutSeconds`) out of the manifest and re-deploy. The resolver-only app deploys cleanly; re-add the sync modules later on a healthy platform state. |

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
| `Jira is not configured. Missing …` | Missing `JIRA_HOST`, `JIRA_EMAIL`, or `JIRA_API_TOKEN` | Fill `.env.local`, restart |
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
| Local dashboard says `/api/jira` is disabled | An interrupted Forge build left the 404 stub | `pnpm dev`/`pnpm build` auto-restore it via `scripts/ensure-local-route.mjs`; manual fallback: `git checkout -- src/app/api/jira/route.ts` |
| Forge page loads but data fails | Bridge invoke failed | Check `forge logs`, Forge variables, scopes |
| Banner: “Could not load dashboard data” | API returned 500; banner shows the Jira error detail | Fix the reported env/JQL/field issue, then Retry |

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
- **Future Predictability is a due-date forecast**, not the Say/Do ratio. It sums open
  child story points and uses weekday capacity.
- **`epicsOnSchedule` uses the Future Predictability score**, not the Say/Do score.
- **Priority distribution is all issues**, not bugs only, despite the Quality section label.
- **Subtasks are excluded** from all metrics and issue lists, except Developer View, which explicitly counts Story + Sub-task.
- **Per-sprint committed sums can count carried work in several sprints** because Jira
  retains the issue in each sprint. Completion is attributed once using resolution/sprint
  dates, with the last-listed sprint as fallback; All-Sprints totals remain de-duplicated.
- **The trend chart’s “moving average” is an expanding average**, unlike the trailing
  3-sprint average in the Executive velocity chart.
- **The trend charts are capped** by `JIRA_SPRINT_WINDOW` (default 5).

### 17.2 Forge parity

The Forge resolver is intentionally simpler than the local engine. Differences to be aware
of:

| Area | Local | Forge today |
|---|---|---|
| Developers tab | populated | populated (Story + Sub-task, original estimate hours) |
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
| **Sprint selection** | All available sprint groups in scope, or the explicitly selected groups |
| **Done** | Status present in `JIRA_DONE_STATUSES` (exact, case-sensitive) |
| **Carry over / spillover** | Committed SP not completed in the sprint |
| **Say/Do** | Done SP ÷ committed SP |
| **Predictability** | Predictability Index = done SP ÷ planned; Feature Milestone Confidence uses the Future Predictability forecast |
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
| `JIRA_QA_DEFECT_JQL` | no | Base JQL plus `issuetype = Bug` | QA defect population |
| `JIRA_QA_UAT_DEFECT_JQL` | no | unset | Optional UAT defect slice; unset displays N/A |
| `JIRA_QA_LEAKAGE_DEFECT_JQL` | no | unset | Optional escaped-defect slice; unset displays N/A |
| `JIRA_STORY_POINTS_FIELD` | no | `customfield_10031` (local) / `10078` (Forge) | Story Points field |
| `JIRA_SPRINT_FIELD` | no | `customfield_10020` | Sprint field |
| `JIRA_POD_FIELD` | no | `customfield_10050` (local) / `10001` (Forge) | POD/team field |
| `JIRA_DONE_STATUSES` | no | `Done,Accepted,Released,Closed,Resolved` | Done status names |
| `JIRA_SUBTASK_DONE_STATUSES` | no | `Done,Closed,Resolved,Completed,Released,Accepted` | Done status names for sub-tasks |
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


### Audit checks and Aha URL

Audit cards share one grid, ordered by Features, Stories, Subtasks, then Defects. Stories Without Estimates counts zero-point stories except Pending Approval. The Orphan Feature card uses an empty/null Aha! URL field, not absence of child stories; only its label changed. The Aha! URL field is discovered by name using Jira field metadata; `JIRA_AHA_URL_FIELD` optionally overrides discovery. Field IDs can differ by site. Unknown mapping appears as Unavailable, and partial field coverage is marked with + rather than a misleading zero. Unknown/not-returned field values are not treated as empty. Equivalent Jira JQL for this field is `issuetype = Feature AND cf[10280] IS EMPTY`, additionally scoped by project/pod. Counts only cover the fetched raw feed; restrictive base JQL or Jira access can limit coverage. Audit items are deduplicated by key, exclude canceled work, and use the current shared pod/quarter/sprint scope.

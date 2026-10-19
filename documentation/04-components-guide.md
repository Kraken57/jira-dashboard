# 04 - Components & UI Architecture Guide

This document catalogs all reusable components, page structures, and tab views in the codebase.

---

## 1. Directory Structure

```
src/components/
├── DashboardLayout.tsx      # App shell with top navigation bar & container
├── Dropdown.tsx             # Accessible, customizable filter select dropdown
├── MetricCard.tsx           # Stat card with title, value, subtitle & trend indicator
├── TabBar.tsx               # Navigation tab bar with active indicator
├── VelocityGrid.tsx         # Chart.js velocity bar and delivery breakdown charts
└── tabs/
    ├── PodTab.tsx           # Pod-level scope and status composition
    ├── DeveloperTab.tsx     # Contributor velocity & contribution table
    ├── SprintAnalysisTab.tsx# Scope churn, cycle/lead times & work item distribution
    ├── QualityTab.tsx       # Defect density, resolution turnaround & severity
    ├── PredictabilityTab.tsx# Say/Do ratio historical comparison table
    ├── DiagnosisTab.tsx     # Root cause slippage analysis & contributor drilldown
    ├── TrendsTab.tsx        # Trajectory line charts & moving average curves
    └── IssuesTab.tsx        # Searchable issues explorer with direct Jira links
```

---

## 2. Shared Components

### `MetricCard.tsx`
Displays a key delivery KPI with trend percentages and Jira color accents.
- **Props**:
  - `title`: Label (e.g. "Say/Do Ratio").
  - `value`: Main stat (e.g. "82%").
  - `subtitle`: Context description.
  - `trend`: Numeric delta (+8 or -4).
  - `trendLabel`: Trend direction text.
  - `color`: `"blue" | "green" | "red"`.

### `Dropdown.tsx`
Custom accessible select menu with click-outside detection and Jira hover states. Used for **Pods**, **Quarter / PI**, and **Sprint** filtering.

### `TabBar.tsx`
Renders the 9 tabs horizontally with responsive horizontal scroll and active border underline.

### `VelocityGrid.tsx`
Contains two Chart.js canvases:
1. **Team Velocity Chart**: Bar chart for completed SP with a dashed red line overlay for committed points.
2. **Sprint Delivery Overview**: 4-color bar chart comparing Planned, Committed, Done, and Carried Over story points.

---

## 3. Tab Components

### `DiagnosisTab.tsx` (Delivery Diagnosis & Root Cause)
- **Top Row**: 4 cards showing Slippage Volume (SP), Primary Driver, At-Risk Contributors, and Incomplete Work Items.
- **Middle Section**: Contributor slippage table highlighting developers carrying incomplete points, their primary blocker reason, and an interactive **"View Issues"** button.
- **Bottom Section**: Table of unfinished work items with direct links to Jira Cloud (`https://one-atlas-yzpp.atlassian.net/browse/KEY`). Clicking a developer in the middle section filters this table instantly to show only their blocking issues.

### `DeveloperTab.tsx`
- Summarizes total contributors, average SP per engineer, and top contributor.
- Displays a detailed velocity table with developer initials, assigned issues, completed issues, delivered SP, and completion progress bars.

### `IssuesTab.tsx`
- Search bar filtering issues in real-time by key (e.g., `CRM-101`), summary, or assignee.
- Filter dropdowns for Work Type and Workflow Status.
- Paginated table (25 items per page) with direct clickable Jira links.

### `TrendsTab.tsx`
- **Velocity Trajectory Chart**: Actual velocity vs 3-sprint rolling moving average.
- **Cumulative Throughput Chart**: Total issues tracked vs issues delivered over time.

---

## 4. Design System & Jira Color Tokens

Tailwind CSS v4 is configured with official Atlassian Jira design tokens:

| Token | Hex Code | Purpose |
|---|---|---|
| `jira-blue` | `#0052cc` | Primary links, brand actions, in-progress badges |
| `jira-blue-bg` | `#deebff` | Blue pill backgrounds |
| `jira-green` | `#0e7c3e` | Completed statuses, high reliability indicators |
| `jira-green-bg` | `#e3fcef` | Green pill backgrounds |
| `jira-amber` | `#f2a900` | Warnings, moderate risk, medium priority |
| `jira-amber-bg` | `#fffae6` | Amber pill backgrounds |
| `jira-red` | `#c03a2b` | Blockers, defects, critical slippage |
| `jira-red-bg` | `#ffebe6` | Red pill backgrounds |
| `jira-bg` | `#f4f5f7` | Jira canvas neutral background |
| `jira-border` | `#dfe1e6` | Standard Jira card and table dividers |
| `jira-text` | `#172b4d` | Primary high-contrast text |
| `jira-text-muted`| `#585f6b` | Secondary labels and table headers |


# 03 - Metrics Engine & Business Logic Guide

> **Historical snapshot.** For current behavior, setup, and metrics, read
> [`08-complete-system-guide.md`](08-complete-system-guide.md) first.

This guide explains the exact mathematical formulas, business rules, and calculation logic implemented in `src/lib/jira/metricsEngine.ts`.

---

## 1. Status Classifications

Work items are classified based on standard Jira workflow statuses:

```typescript
const DONE_STATUSES = new Set(["Done", "Released", "Accepted"]);
```
- **Completed (Done)**: Status matches `Done`, `Released`, or `Accepted`.
- **In Flight (In Progress)**: Status is `In Progress`, `Selected for Development`, `Testing`, or `Code Review`.
- **Backlog / To Do**: Status is `To Do`, `Open`, or `Backlog`.

---

## 2. Executive KPI Formulas

### 1. Say/Do Ratio (Commitment Reliability)
Measures the percentage of committed story points that were successfully delivered in the sprint.

$$\text{Say/Do Ratio} = \left( \frac{\text{Completed Story Points}}{\text{Committed Story Points}} \right) \times 100$$

- **Target Benchmark**: $\ge 80\%$ (High Reliability).
- **Warning Threshold**: $65\% - 79\%$ (Moderate).
- **Critical Threshold**: $< 65\%$ (At Risk).

### 2. Sprint Carry Over (Spillover)
Measures the proportion of work that could not be finished and rolled over into subsequent sprints.

$$\text{Carry Over \%} = 100\% - \text{Say/Do Ratio}$$

- **Target Benchmark**: $\le 15\%$ spillover.

### 3. Team Velocity
Average story points delivered over the last 3 completed iterations:

$$\text{Rolling Velocity} = \frac{\sum_{i=n-2}^{n} \text{Completed SP}_i}{3}$$

- **Trend Status**:
  - `rising`: $\text{Completed SP}_n > \text{Completed SP}_{n-1}$
  - `falling`: $\text{Completed SP}_n < \text{Completed SP}_{n-1}$
  - `stable`: No significant change.

### 4. Feature Predictability Score
Combines delivery consistency and epic completion milestones:

$$\text{Predictability Score} = \min(96, \max(60, \text{Say/Do Ratio} \times 1.04))$$

---

## 3. Contributor & Developer Metrics

Calculated by aggregating all work items assigned to each engineer:

```typescript
completionRate = Math.round((deliveredSP / totalAssignedSP) * 100);
```

- **Assigned Issues**: Total work items where `issue.assignee === developer.name`.
- **Completed Issues**: Count of assigned issues where `status` is in `DONE_STATUSES`.
- **Delivered SP**: Sum of story points on completed issues.
- **Top Contributor**: The engineer with the highest total `deliveredSP` in the filtered period.

---

## 4. Sprint Flow & Analysis Metrics

### 1. Sprint Scope Churn %
Measures mid-sprint volatility caused by adding or removing requirements post-planning:

$$\text{Scope Churn \%} = \text{Carry Over \%} \times 0.7$$

### 2. Planned vs Unplanned Work Share
- **Planned Work %**: $88\%$ standard baseline for feature commitments.
- **Unplanned Work %**: $12\%$ dedicated to emergency bug fixes and customer escalations.

### 3. Cycle Time & Lead Time
- **Average Cycle Time**: $4.2\text{ days}$ (Time elapsed from `In Progress` $\to$ `Done`).
- **Average Lead Time**: $7.8\text{ days}$ (Time elapsed from issue creation $\to$ production delivery).

---

## 5. Quality & Defect Metrics

### 1. Defect Density
Measures bugs reported per 100 Story Points delivered:

$$\text{Defect Density} = \left( \frac{\text{Total Bugs}}{\text{Total Story Points}} \right) \times 100$$

- An industry benchmark for healthy SaaS delivery is under $5\%$.

### 2. Bug Resolution Rate %
$$\text{Resolution Rate} = \left( \frac{\text{Resolved Bugs}}{\text{Total Reported Bugs}} \right) \times 100$$

### 3. Priority Distribution
Categorizes bugs and issues by SLA urgency:
- `Highest` / `High`: SLA turnaround $< 24$ hours (Red).
- `Medium`: Standard sprint backlog priority (Amber).
- `Low`: Quality of life / polish (Blue).

---

## 6. Delivery Diagnosis & Root Cause Analysis Logic

When the Say/Do ratio drops or velocity decreases, the **Delivery Diagnosis** engine pinpoints the exact reasons and responsible items.

### Slippage Determination Rule
For every unfinished work item (`status` not in `DONE_STATUSES`), a root cause diagnosis is assigned based on the following precedence rules:

```typescript
const getReason = (item: JiraWorkItem) => {
  if (item.workType === "Bug" || item.summary.toLowerCase().includes("bug")) {
    return "Defect / Unresolved Bug";
  }
  if ((item.storyPoints || 0) >= 8) {
    return "High Complexity Scope (8+ SP)";
  }
  if (item.status === "In Progress") {
    return "In-Progress Bottleneck";
  }
  if (item.status === "Code Review" || item.status === "Testing") {
    return "Review / QA Pipeline Delay";
  }
  if (item.status === "Selected for Development") {
    return "Delayed Start / Backlog Delay";
  }
  return "Carried-Over Scope";
};
```

### Contributor Slippage Aggregation
For each developer carrying incomplete points:
1. `incompleteSP`: Sum of unfinished story points.
2. `completedSP`: Sum of delivered story points.
3. `primaryReason`: The most frequent root cause among their unfinished items.
4. Developers are ranked descending by `incompleteSP`, putting at-risk contributors at the top.
5. In the UI, clicking **"View Issues"** filters the issue explorer to only show their specific unfinished items, each with a direct clickable link to Jira Cloud.


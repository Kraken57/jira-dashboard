# 01 - Project Overview & System Architecture

> **Historical snapshot.** For current behavior, setup, and metrics, read
> [`08-complete-system-guide.md`](08-complete-system-guide.md) first.

## 1. Executive Summary

The **Enterprise Sprint Performance Dashboard** is a high-performance, real-time analytics web application built to monitor sprint health, delivery predictability, contributor output, defect density, and delivery bottlenecks across multi-pod agile organizations.

It connects directly to **Atlassian Jira Cloud** (`https://one-atlas-yzpp.atlassian.net`) tracking **930+ work items** and **4,000+ Story Points** across 5 core Service Pods:
1. **CRM** — Customer Relationship Management
2. **DTP** — Data Technology Platform
3. **ERP** — Enterprise Resource Planning
4. **SEC** — Security Engineering
5. **SRG** — Service Reliability Group

The system is designed with a **Dual-Mode Architecture**:
1. **Localhost / Standalone Mode**: Runs as a full-stack Next.js 16 application with high-speed in-memory caching and server-side API routes.
2. **Atlassian Forge Mode**: Deploys natively into Jira Cloud as a Forge Global Page (`jira:globalPage`), running the frontend in a secure iframe and querying Jira APIs via `@forge/api` and `@forge/bridge`.

---

## 2. High-Level Architecture Diagram

```
+-----------------------------------------------------------------------------------------+
|                                    USER INTERFACE                                       |
|  +--------------------+---------------------------------------------------------------+ |
|  | Filters Bar        | Pods (5 pods) | Quarters (CY26 PI.1-4) | Sprints (Iter 1-4)   | |
|  +--------------------+---------------------------------------------------------------+ |
|  | Tabbed Navigation  | Executive | Pod | Dev | Sprint | Quality | Predict | Diagnosis| |
|  |                    | Trends    | Issues Explorer                                   | |
|  +--------------------+---------------------------------------------------------------+ |
+-----------------------------------------------------------------------------------------+
                                           |
                                           v
                   Universal Data Fetch Client (`src/lib/api.ts`)
                                           |
                  +------------------------+------------------------+
                  |                                                 |
                  v (In Forge iframe)                               v (Localhost / Web)
     Forge Bridge (`@forge/bridge`)                     Next.js API Route (`/api/jira`)
                  |                                                 |
                  v                                                 v
         Forge Backend Resolver                       Jira Data Service (`jiraService.ts`)
          (`forge/src/index.ts`)                                    |
                  |                                    +------------+------------+
                  |                                    |                         |
                  v                                    v                         v
       `api.asUser().requestJira()`            In-Memory Cache           Live Jira Cloud REST
                                                 (~20ms lookup)          `POST /rest/api/3/search/jql`
                                                       |                         |
                                                       +------------+------------+
                                                                    |
                                                                    v
                                                     Metrics Engine (`metricsEngine.ts`)
                                                     Computes KPIs, Trends, Diagnosis
```

---

## 3. Technology Stack & Design Decisions

| Technology | Selection Rationale |
|---|---|
| **Next.js 16 (App Router)** | Provides React 19 server/client components, optimized bundling via Turbopack, and unified API routes in a single repository. |
| **TypeScript (Strict Mode)** | Enforces compile-time type safety across all metrics, Jira API payloads, filter states, and UI tab props. Zero `any` usage. |
| **Tailwind CSS v4** | Custom-tokenized with official Atlassian Jira design colors (`jira-blue`, `jira-green`, `jira-amber`, `jira-red`, `jira-bg`, `jira-border`). Provides senior, clean, minimal styling with zero CSS bloat. |
| **Chart.js & React-Chartjs-2** | Canvas-accelerated charting for velocity bars, moving average trendlines, and cumulative throughput growth curves. |
| **Atlassian Forge SDK** | Enables seamless enterprise packaging into Jira Cloud marketplace apps without needing external server hosting. |

---

## 4. Key Capabilities & Tabs

- **Executive Summary**: High-level KPIs (*Say/Do Ratio*, *Sprint Carry Over*, *Team Velocity*, *Feature Predictability*) and dynamic delivery charts.
- **Pod View**: Pod-specific health, scope, workload composition, and workflow state breakdown.
- **Developer View**: Contributor output, assigned vs completed counts, delivered story points, and completion rate progress bars.
- **Sprint Analysis**: Scope churn %, planned vs unplanned work share, average cycle time & lead time (days), and issue-type distribution.
- **Quality**: Defect density (% bugs per 100 SP), bug fix resolution turnaround, and severity/priority distribution.
- **Predictability**: Predictability Index, commitment variance (±SP), epic release confidence, and iteration historical reliability rating.
- **Delivery Diagnosis (Root Cause)**: Identifies why velocity drops, calculates unfinished story point slippage, highlights contributors carrying incomplete work, and lists the exact blocking Jira issues with direct links.
- **Trends**: Peak velocity, rolling moving average trendline, and cumulative issue throughput growth charts.
- **Issues Explorer**: Live searchable table of all issues with instant filtering by type and status, priority indicators, and direct clickable Jira Cloud links (`https://one-atlas-yzpp.atlassian.net/browse/KEY`).

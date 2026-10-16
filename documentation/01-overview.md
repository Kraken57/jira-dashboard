# Project Overview

## What we built

A single-screen Jira-style dashboard frontend. It shows:

- A **pod filter dropdown** (All Pods or individual pods)
- A **sprint timeline** showing each team's sprint dates
- **Metric cards** (Done Ratio, Sprint Carry Over, Team Velocity, Feature Predictability)
- A **velocity grid**: 6 story-point boxes on the left, 4 histogram charts on the right (Planned, Committed, Done, Carried Over)
- **Tabs**: Executive Summary, Pod View, Developer View

## What we did NOT build (yet)

- No backend / API
- No connection to Jira
- No real data — all data is mock data in `src/lib/mockData.ts`
- No authentication
- No charts beyond the 4 histograms

## Why this stack

| Choice | Reason |
|--------|--------|
| **Next.js (App Router)** | Built-in API routes means when you add a backend later, it lives in the same repo. No separate frontend/backend split needed yet. |
| **TypeScript** | Type-safe, as required. |
| **Tailwind CSS** | Utility classes keep styles inside components — no bulky separate CSS files. Easier to maintain than raw CSS. |
| **chart.js + react-chartjs-2** | You asked for chart.js. Used for the 4 histogram graphs. |
| **No shadcn / no @atlaskit** | shadcn needs re-styling to match Jira. Atlaskit is heavy. Custom Tailwind with Jira color tokens gives the Jira look with fewest dependencies. |

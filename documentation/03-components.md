# Component Guide

## DashboardLayout (`src/components/DashboardLayout.tsx`)
Outer shell. Contains a clean top navigation bar and a `<main>` area where page content goes.
- No "Jira dashboard" text in the nav — the page heading lives in `page.tsx`.

## PodFilter (`src/components/PodFilter.tsx`)
Dropdown labeled "Services" showing "All Services" or individual pods (Alpha, Beta, Gamma, etc.).
- **Props**: `label`, `pods`, `value`, `onChange`
- **Reusable**: Use anywhere you need a service/pod selector.

## SprintFilter (`src/components/SprintFilter.tsx`)
Dropdown inside the filter bar showing available sprints (e.g. "Sprint 24 - Core").
- **Props**: `sprints`, `value`, `onChange`
- **Reusable**: Use anywhere you need a sprint selector.

## MetricCard (`src/components/MetricCard.tsx`)
A stat card with title, big value, subtitle, trend percentage, and color.
- **Props**: `title`, `value`, `subtitle`, `trend`, `trendLabel`, `color` (blue/green/amber/red)

## TabBar (`src/components/TabBar.tsx`)
Horizontal tab navigation with active state styling.
- **Props**: `tabs`, `active`, `onChange`

## VelocityGrid (`src/components/VelocityGrid.tsx`)
12-grid layout:
- Left 6 columns: 6 velocity boxes (story points per sprint)
- Right 6 columns: 4 histogram bar charts (Planned, Committed, Done, Carried Over)

## Adding a new component (pattern)

1. Create `src/components/YourComponent.tsx` with `"use client"` if it uses hooks
2. Export a function component with TypeScript props
3. Import and use it in `src/app/page.tsx`

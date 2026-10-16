# File Structure

```
jira-dashboard/
├── src/
│   ├── app/
│   │   ├── layout.tsx        # Root HTML shell (Next.js layout)
│   │   ├── page.tsx          # Main dashboard page (ties all components together)
│   │   └── globals.css       # Tailwind + Atlassian/Jira color tokens
│   ├── components/
│   │   ├── DashboardLayout.tsx   # Outer shell: nav bar + main content area
│   │   ├── PodFilter.tsx         # Services/pod dropdown (All Services or individual pods)
│   │   ├── SprintFilter.tsx      # Sprint dropdown (inside filter bar)
│   │   ├── MetricCard.tsx        # Reusable stat card (title, value, trend, color)
│   │   ├── TabBar.tsx            # Tab navigation (Executive / Pod / Developer)
│   │   └── VelocityGrid.tsx      # 6 velocity boxes + 4 histogram charts
│   ├── lib/
│   │   ├── mockData.ts           # All mock data (pods, sprints, metrics, chart series)
│   │   └── api.ts                # Fetch wrapper — ready for backend later
├── documentation/
│   ├── 01-overview.md
│   ├── 02-file-structure.md
│   ├── 03-components.md
│   ├── 04-backend-plan.md
│   └── 05-how-to-run.md
├── public/                     # Static assets
├── package.json
├── tsconfig.json
├── next.config.ts
└── tailwind.config.ts
```

## Where to add new things

| Want to... | Edit this file |
|------------|----------------|
| Change dashboard layout | `src/app/page.tsx` |
| Add a new metric card | `src/components/MetricCard.tsx` + `src/lib/mockData.ts` |
| Add a new tab | `src/app/page.tsx` (TABS array) |
| Change colors/theme | `src/app/globals.css` |
| Add real backend data | `src/lib/api.ts` + `src/app/page.tsx` |

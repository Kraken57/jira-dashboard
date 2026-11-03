# Repository and Forge deployment analysis

## Architecture

- The frontend is a Next.js App Router application in `src/`; `src/app/page.tsx` owns tab state, shared filters, dashboard fetch, and popup state.
- Standalone mode uses `src/app/api/jira/route.ts` and Jira Cloud REST with server-side credentials from `.env.local`.
- Forge mode exports a static bundle from the same React app. `src/lib/api.ts` calls the Forge bridge; `forge/src/index.ts` resolves data with Forge app authentication.
- Jira fetching and mapping live in `src/lib/jira/jiraService.ts`; dashboard calculations live in `src/lib/jira/metricsEngine.ts`. Forge maintains a separate implementation in `forge/src/index.ts`.
- Quality combines Jira QA capacity/defect information with Zephyr Essentials test cases and execution data. Zephyr API access uses `JIRA_ZEPHYR_API_TOKEN` and project keys; it does not use Jira API-token Basic authentication.

## Build and assets

- The installed frontend dependencies are Next.js 16.4.2 and React/React DOM 19.3.0; Forge backend runtime is Node 22 (`forge/manifest.yml`). Keep `scripts/build-forge.mjs` version-aware when selecting the Next builder flag.
- Tailwind v4 is compiled by `postcss.config.js` using `@tailwindcss/postcss`.
- `next.config.mjs` sets static export and `assetPrefix: "./"` only for Forge builds. The local Jira API route is temporarily stubbed during export and restored afterward.
- `scripts/validate-forge.mjs` checks build configuration, resource mapping, CSS/JS output, Webpack public path, and parity between `out/` and `forge/out/`.

## Important constraints

- Do not commit `.env.local`, Jira tokens, Zephyr tokens, or generated output.
- Keep local Jira and Forge Zephyr type mappings aligned where both consume the same API objects.
- Local checks cannot establish Jira permissions or production CDN behavior. Use the deployment checklist for installed-app verification.
- `documentation/08-complete-system-guide.md` remains the source for feature logic and metric formulas; this file is a short repository map.

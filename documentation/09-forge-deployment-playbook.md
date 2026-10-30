# 09 - Forge Deployment Playbook (current, verified)

> The **only** deployment steps actually used to get this app live on Forge and
> inside Jira, including every pitfall hit along the way and its fix.
> No site names, credentials, or project-specific field IDs: replace every
> **placeholder** in brackets with your own values.
> For the full product architecture, see [`08-complete-system-guide.md`](08-complete-system-guide.md).

---

## 0. Placeholders used in this document

| Placeholder | Meaning | Example shape |
|---|---|---|
| `YOUR_SITE.atlassian.net` | the Jira cloud site you install on | `acme.atlassian.net` |
| `PROJECT` | Jira projects the dashboard reads | `project in (ABC, DEF)` |
| `JIRA_SP_FIELD` | story points custom field id | `customfield_XXXXX` |
| `JIRA_SPRINT_FIELD` | sprint custom field id | `customfield_10020` |
| `JIRA_POD_FIELD` | pod/team custom field id | `customfield_10045` |
| `DONE_STATUSES` | comma-separated done status names | `Done,Accepted,Released` |

---

## 1. Prerequisites

- Node.js — use the version that matches your Forge CLI (see §8 table); check with `node --version`.
- `pnpm` (`node_modules` must be installed in the OS that runs the app; on Windows/WSL repos, install inside the shell that runs `pnpm dev`).
- Forge CLI — `npm install -g @forge/cli` (this run used 14.2.0; newer majors need newer Node).
- You own the app id in `forge/manifest.yml` (if `forge deploy` says you lack permission, create a new app in the Atlassian Developer Console and replace `app.id`).

---

## 2. Build the static frontend

```bash
pnpm install            # first time on a new machine/OS
pnpm run build:forge
```

- Output: `./out` copied to `forge/out` (the manifest resource paths read `out` relative to `forge/`).
- The script temporarily swaps `src/app/api/jira/route.ts` for the Forge stub and **restores it** on success/failure/kill — the last log line must say `Restored original /api/jira route`.
- Two build steps live inside it and matter: `assetPrefix: "./"` + a sweep for absolute `/_next/...` (Forge serves Custom UI from a **nested** path — absolute asset URLs 404 and the page renders as bare HTML), and `next build --webpack` (Turbopack's chunk runtime throws an invariant under Forge and aborts hydration).
- Tailwind for the Forge build runs through `postcss.config.js` (gated on `FORGE_BUILD=true`); without it the CSS ships with no utility classes.

---

## 3. Login

```bash
cd forge
forge login        # prints a URL; open it in a browser and click Allow
forge whoami       # sanity check
```

All Forge commands must run from inside `forge/` (the CLI resolves `manifest.yml` there).

---

## 4. Configure variables (exact syntax)

The CLI takes **key and value as separate arguments** — not `KEY=value`, no line continuations:

```bash
forge variables set --environment development \
  JIRA_HOST https://YOUR_SITE.atlassian.net
forge variables set --environment development JIRA_JQL "PROJECT"
forge variables set --environment development JIRA_STORY_POINTS_FIELD JIRA_SP_FIELD
forge variables set --environment development JIRA_SPRINT_FIELD JIRA_SPRINT_FIELD
forge variables set --environment development JIRA_POD_FIELD JIRA_POD_FIELD
forge variables set --environment development JIRA_DONE_STATUSES "DONE_STATUSES"
forge variables set --environment development JIRA_SUBTASK_DONE_STATUSES "Done,Closed,Resolved,Completed,Released,Accepted"
forge variables set --environment development JIRA_QA_CAPACITY_HOURS_PER_WEEK 40
forge variables set --environment development JIRA_QA_TEST_ISSUE_TYPES "Test"
forge variables set --environment development JIRA_QA_SUPPORT_ISSUE_TYPES "Support"
forge variables set --environment development JIRA_QA_MEMBERS "Sandeep Annaldas,Arun Aare,Naman Goel,Anantha Garapati,Roja PS,Sahaj Arora,Durga Sridhar Kaligotla"
forge variables list --environment development     # verify
```

(`--environment development` is the default; use `-e production` for the prod run in §6.)

Two timing rules:
1. **Variables are baked into the deployed app version** — after changing any variable, re-run `forge deploy` or the running app keeps the old value (the resolver reads `kvs` saved config first, then Forge variables, then code defaults).
2. Do **not** set email/token variables — the resolver authenticates with `api.asApp()`.

Values live in Atlassian, never in git.

---

## 5. Deploy and install (development)

```bash
forge deploy --environment development --approve MAJOR_VERSION_RULE
forge install --site YOUR_SITE.atlassian.net --product jira --environment development
```

- `--approve MAJOR_VERSION_RULE` acknowledges the version/scope-change approval the CLI otherwise refuses on. When no approval is pending, omit it.
- Installing a development build onto a production Jira site is **intentional for testing** — the CLI warns, answer `y` to proceed.
- **Already installed?** The plain install fails with `already installed … COMPLETED` — use the upgrade instead:

```bash
forge install --upgrade --site YOUR_SITE.atlassian.net --product jira --environment development
```

After later code changes: re-run `pnpm run build:forge` → `forge deploy` → hard-refresh the page (the iframe embed URL is versioned; stale tabs can pin an older version — test in a new/incognito window if the page misbehaves).

---

## 6. Production

```bash
forge variables set --environment production JIRA_HOST https://YOUR_SITE.atlassian.net
# …repeat every variable from (including the four QA-capacity ones) §4 with --environment production
forge deploy --environment production --approve MAJOR_VERSION_RULE
forge install --site YOUR_SITE.atlassian.net --product jira --environment production
# …or --upgrade if it was already installed
```

---

## 7. Verify it works (dev tunnel)

```bash
forge tunnel --environment development
```

Then open, in a fresh/incognito browser window:

```
https://YOUR_SITE.atlassian.net/jira/apps/<your-app-id>/<environment-uuid>
```

Success signals:
- Styled, interactive dashboard (tabs, dropdowns, cards).
- First data load ≈ 10–15 s once (the raw feed fills cache)… then instant.
- Header chip shows `snapshot 0m old (fresh)` right after load; later `snapshot Xm old` during background refreshes.
- Tunnel prints `invocation: … index.handler` per resolver call; **success is silent**, failures print a red block.
- The `Statsig`/`Sentry`/`xp.atlassian.com` red lines in the browser console are Jira's own telemetry blocked by ad-blockers — unrelated noise; ignore permanently.

---

## 8. Troubleshooting — every error hit in practice and its fix

| Symptom | Cause | Fix |
|---|---|---|
| Page = bare HTML, no CSS/JS/interactivity in the iframe | Absolute `/_next/...` asset URLs 404 under Forge's nested path | `assetPrefix: "./"` in `next.config.ts` (Forge builds only) + the `/_next` path sweep in `scripts/build-forge.mjs` |
| `Invariant: Expected document.currentScript src to contain './​_next/'` and the page freezes prerendered | Turbopack chunk runtime aborts when assetPrefix is relative (browsers strip `./` during URL resolution) | Build with `next build --webpack` (set in `scripts/build-forge.mjs`) |
| Page hydrates + data loads but **no styling/colors** | Tailwind v4 wired only through the Turbopack loader; the webpack Forge build ships CSS with zero utility classes | `postcss.config.js` gated on `FORGE_BUILD=true` running `@tailwindcss/postcss` (Next requires a **plain object** export, not a function) |
| `Function with handler "index.handler" was not found` in the browser | Frontend browser cache or the Jira SPA pinned a stale embed/version | Fresh/incognito window; re-run `forge install --upgrade` if it persists |
| `Forge raw feed failed: …` / `Failed to fetch dashboard data` after variables changed | Variables are baked into the deployed version | Re-run `forge deploy` after `forge variables set` |
| `ApplicationCompileError` with no detail | The imported SDK isn't supported by the platform compile service (seen with `@forge/kvs`) | Use the facade pattern: `forge/src/kvsClient.ts` degrades to the legacy storage module and keeps `kvs` app-surface semantics; re-try the SDK import later |
| `TypeScript emitted no output for <file>` at packaging | `noEmit: true` in `forge/tsconfig.json` inherited by the packager | Never set `noEmit` there; the typecheck script passes `--noEmit` on the CLI |
| `'variables set --environment' is not a Forge command` | Wrong argument form / multi-line continuation | `forge variables set --environment development KEY value` — separate args |
| `manifest-file-required` | Forge command run from the repo root | `cd forge` first |
| `Unsupported Node.js version` (CLI ≥15) | CLI 15 majors require Node ≥22.23.4 | Stay on CLI 14.2 with Node 22.x, or align Node to the CLI's requirement |
| `Specified Version did not exist` (`VERSION_NOT_FOUND`) on **every** deploy | Environment version contract corrupted (seen after an interrupted `--major-version` deploy attempt) | Plain `forge deploy` normally still works for minor versions; if even those fail, comment the `trigger`, `scheduledTrigger`, `consumer` blocks (and their per-function `timeoutSeconds`) out of `forge/manifest.yml` and re-deploy. Re-add the sync modules later on healthy platform state |
| Hourly `[forge-storage] … storage.execute is not a function` in tunnel logs | The declared-but-unwired scheduled sync module failing on its SQL adapter | Same manifest comment-out as above (kept disabled until the SQL surface is wired) |

---

## 9. Local fallback (never cheat these)

- Local dev on `pnpm dev` uses `GET /api/jira?raw=1` (disk-cached raw feed) or the legacy per-filter route; inside Jira the frontend uses the Forge bridge and dev install of the app.
- `scripts/build-forge.mjs` self-heals the API route; `scripts/ensure-local-route.mjs` runs on `pnpm dev`/`pnpm build` and restores the real route from a backup or `git show HEAD` — never commit the 404 stub manually.
- `.cache/` holds the local disk feed cache — gitignored; delete it to force a fresh Jira pull.

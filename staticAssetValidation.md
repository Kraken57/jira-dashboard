# Static asset validation

Forge Custom UI serves the export below a versioned nested URL. Relative HTML paths alone are insufficient: lazy chunks also depend on the Webpack runtime's public path.

## Commands

```bash
pnpm run build:forge
pnpm run validate:export
pnpm run validate:assets
pnpm run validate:forge
pnpm run test:forge
pnpm run preview:forge
```

`build:forge` creates `out/`, copies it to `forge/out/`, restores `src/app/api/jira/route.ts`, then runs the aggregate checks. `preview:forge` serves the resource under a simulated nested iframe path; it cannot connect to the Atlassian bridge.

## What the validator checks

- Canonical `next.config.mjs`, static export mode, relative asset prefix, and disabled image optimization.
- Nonempty CSS/JavaScript bundles, compiled Tailwind utility output, and Webpack runtime path `./_next/`.
- Local resolution of HTML, RSC text, and CSS asset references beneath the Forge resource mount; no absolute or escaping references.
- Manifest resource path, inline-content permissions, full file parity between `out/` and `forge/out/`, and static files against `.next/static`.
- Static route output and restoration of the real dynamic local Jira API route.

The regression suite includes invalid and incomplete resource fixtures. It does not establish that Atlassian's deployed CDN, installation version, CSP, or Jira resolver permissions are correct. Confirm those in the installed app's Network panel after deployment.

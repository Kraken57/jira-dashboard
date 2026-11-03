# Forge pre-deploy checklist

## Before building

- Use the repository's pnpm lockfile and install dependencies on the same OS that will run the build.
- Check `node --version`, `forge --version`, and `forge whoami`.
- Run builds sequentially; `build:forge` temporarily replaces the local Jira route and shares the `.next` directory.
- Set Forge variables in each target environment. `.env.local` is for standalone development and is not deployed.

## Local release gates

Run from the repository root and stop if any command fails:

```bash
pnpm run test:forge
node_modules/typescript/bin/tsc --noEmit
pnpm lint
cd forge && node node_modules/typescript/bin/tsc --noEmit
cd ..
pnpm build
pnpm run build:forge
pnpm run validate:export
pnpm run validate:assets
pnpm run validate:forge
```

The Forge build itself runs the aggregate validator. Do not run a local `pnpm build` after the final Forge build and before validating its export; it replaces the shared Next build metadata. Rebuild after source, config, dependency, or manifest changes.

## Deploy

Run Forge CLI commands from `forge/`. Use the package lifecycle hook so a fresh validated export precedes deployment:

```bash
pnpm run deploy -- --environment production
forge install --upgrade --site YOUR_SITE.atlassian.net --product jira --environment production
```

For a first installation, omit `--upgrade`. Review and approve any permission or major-version change requested by Forge. Do not use raw `forge deploy` as the normal release path because it bypasses the package hook.

## Installed app acceptance

- Open Jira in a fresh window and confirm the app/environment.
- Inspect requests in the embedded app with cache disabled.
- Confirm all `_next/static` requests use the current resource version and return 200, with appropriate MIME types and no CSP errors.
- Confirm Jira data, tabs, filters, and drilldowns work.
- If an asset fails, record its full request URL, status, response, initiator, and deployed version before changing the build.

A successful local build is not proof of a successful production install. Production acceptance requires access to the deployed Jira app.

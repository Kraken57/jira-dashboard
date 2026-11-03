# Forge deployment audit

This audit records the source and local packaging risks relevant to the Forge Custom UI bundle. It does not certify production CDN responses; those require a deployed app and Jira access.

## Asset and build findings

- **Relative runtime assets:** Forge mounts Custom UI under a versioned nested URL. `assetPrefix: "./"` must be set before compilation so initial and lazy chunks resolve within that mount. Rewriting HTML after the build cannot repair Webpack's runtime path.
- **Version-sensitive builder:** the installed Next major controls the CLI options. `scripts/build-forge.mjs` uses default Webpack for Next 14/15 and `--webpack` for Next 16+.
- **Markup normalization:** HTML and RSC text references are normalized relative to each file's directory. Compiled JavaScript is never rewritten.
- **Stale resource risk:** Forge uploads the directory referenced by `manifest.yml`, not a local `.next` build. The validator checks the export, Tailwind output, public paths, manifest mapping, and byte parity between `out` and `forge/out`.
- **CSP:** the manifest allows inline scripts and styles required by the current Next bootstrap and dashboard styling. This permission change is separate from external network access.
- **Route recovery:** the Forge builder swaps the local `/api/jira` route for a static stub and restores the original in a `finally` block and on catchable termination signals.

## Verification boundary

Local checks can prove that generated files exist, use relative paths, and match the manifest resource. They cannot prove that Atlassian serves a deployed resource successfully or that the installed version is current. After deployment, inspect the iframe Network panel with cache disabled. Confirm `_next/static` requests use the current resource prefix, return 200 with CSS/JavaScript MIME types, and that lazy bridge chunks load. Capture the full URL, status, response body, headers, initiator, and deployed version for any failure.

See [the pre-deploy checklist](forgePreDeployChecklist.md) for release commands and [static asset validation](staticAssetValidation.md) for local checks.

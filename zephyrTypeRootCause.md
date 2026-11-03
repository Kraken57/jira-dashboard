# Zephyr response typing root cause

## Root cause

The Forge resolver aggregated Zephyr API results as `Record<string, unknown>[]`. It then spread test case objects into a `caseRows` array and accessed fields such as `id`, `key`, `name`, `status`, and `owner`. The index-signature type does not guarantee those named members, and TypeScript inferred the spread row too narrowly. The API objects still contained their fields at runtime; this was a compile-time model gap.

The standalone integration had the equivalent type failure in `src/lib/jira/jiraService.ts`. Its `allCases` and `allExecutions` rows now explicitly carry their project key/name alongside the API fields.

## Repair

`forge/src/index.ts` now models the Zephyr v2 fields used by the resolver: resource links, user links, linked issues, test cases, executions, paginated responses, per-project data, and enriched case rows. Pagination is generic over the endpoint so `testcases` and `testexecutions` preserve their distinct row types. The endpoint request and normalization behavior remain unchanged.

The interfaces describe only fields consumed by this application. The response assertion is a TypeScript boundary declaration, not runtime schema validation. No Jira or Zephyr tenant request is implied by this report. Validate the API payload and permissions in the target Jira account.

## Verification notes

Run `node forge/node_modules/typescript/bin/tsc --noEmit --project forge/tsconfig.json` for Forge typing and `node_modules/typescript/bin/tsc --noEmit` for the frontend. A successful Next build alone may not typecheck the separate Forge resolver. No build is run by this document.

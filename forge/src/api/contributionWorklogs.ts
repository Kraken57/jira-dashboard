// Independent Forge implementation; keep the worklog contract aligned with the app.
import api, { route } from "@forge/api";

interface ContributionWorklogPage {
  issueKey: string;
  startAt: number;
  total: number;
  worklogs: { id: string; authorAccountId: string | null; authorName: string; started: string | null; timeSpentSeconds: number }[];
}

/** Strictly preserve authors/dates from Jira; missing identity is never replaced by the assignee. */
export function normalizeContributionWorklogPage(issueKey: string, value: unknown): ContributionWorklogPage {
  const page = value as { startAt?: number; total?: number; worklogs?: unknown[] } | null;
  if (!page || !Array.isArray(page.worklogs) || !Number.isSafeInteger(page.total) || page.total! < 0
    || !Number.isSafeInteger(page.startAt) || page.startAt! < 0) {
    throw new Error("Jira returned an invalid worklog page");
  }
  const worklogs = page.worklogs.map((value) => {
    const row = value as { id?: string; author?: { accountId?: string; displayName?: string }; started?: string; timeSpentSeconds?: number };
    if (!row || typeof row.id !== "string" || !row.id || !Number.isFinite(row.timeSpentSeconds) || row.timeSpentSeconds! < 0) {
      throw new Error("Jira returned a worklog without a valid ID or duration");
    }
    return {
      id: row.id,
      authorAccountId: typeof row.author?.accountId === "string" && row.author.accountId ? row.author.accountId : null,
      authorName: typeof row.author?.displayName === "string" && row.author.displayName ? row.author.displayName : "Unknown worklog author",
      started: typeof row.started === "string" && Number.isFinite(Date.parse(row.started)) ? row.started : null,
      timeSpentSeconds: row.timeSpentSeconds!,
    };
  });
  if (page.startAt! + worklogs.length > page.total! || (!worklogs.length && page.startAt! < page.total!)) {
    throw new Error("Jira returned an incomplete worklog page");
  }
  return { issueKey, startAt: page.startAt!, total: page.total!, worklogs };
}

export function validateWorklogRequest(issueKey: unknown, startAt: unknown): asserts issueKey is string {
  if (typeof issueKey !== "string" || !/^[A-Z][A-Z0-9_]*-\d+$/i.test(issueKey)
    || typeof startAt !== "number" || !Number.isSafeInteger(startAt) || startAt < 0 || startAt > 10_000_000) {
    throw new Error("A valid Jira issue key and worklog offset are required");
  }
}

/** Two bounded Jira calls per invocation; never loop over a portfolio inside a resolver. */
export async function getContributionWorklogs(issueKey: string, startAt: number, jql: string) {
  validateWorklogRequest(issueKey, startAt);
  const baseJql = jql.replace(/\s+ORDER\s+BY[\s\S]*$/i, "").trim();
  const scope = await api.asApp().requestJira(route`/rest/api/3/search/jql`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ jql: `(${baseJql}) AND key = "${issueKey}"`, fields: ["key"], maxResults: 1 }),
    signal: AbortSignal.timeout(8000),
  });
  if (!scope.ok) throw new Error(`Jira worklog scope check returned ${scope.status}`);
  const match = await scope.json() as { issues?: { key?: string }[] };
  if (!match.issues?.some((issue) => issue.key?.toUpperCase() === issueKey.toUpperCase())) {
    throw new Error("Work item is not readable in the configured dashboard scope");
  }
  const response = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/worklog?startAt=${startAt}&maxResults=100`, {
    headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Jira worklogs for ${issueKey} returned ${response.status}`);
  return normalizeContributionWorklogPage(issueKey, await response.json());
}

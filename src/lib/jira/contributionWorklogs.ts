import { isJiraConfigured, JIRA_CONFIG } from "./config";
import { normalizeContributionWorklogPage, validateWorklogRequest } from "./contributionPreparation";

/** One page per request keeps optional worklog loading out of the dashboard feed. */
export async function getContributionWorklogs(issueKey: string, startAt: number) {
  validateWorklogRequest(issueKey, startAt);
  if (!isJiraConfigured()) throw new Error("Jira is not configured");
  const base = JIRA_CONFIG.host.replace(/\/+$/, "");
  const headers = {
    Authorization: `Basic ${Buffer.from(`${JIRA_CONFIG.email}:${JIRA_CONFIG.apiToken}`).toString("base64")}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const jql = (process.env.JIRA_JQL || "project in (DTR)").replace(/\s+ORDER\s+BY[\s\S]*$/i, "").trim();
  // Check the configured dashboard scope; accepting an arbitrary key must not widen it.
  const scope = await fetch(`${base}/rest/api/3/search/jql`, {
    method: "POST", headers, cache: "no-store", signal: AbortSignal.timeout(8000),
    body: JSON.stringify({ jql: `(${jql}) AND key = "${issueKey}"`, fields: ["key"], maxResults: 1 }),
  });
  if (!scope.ok) throw new Error(`Jira worklog scope check returned ${scope.status}`);
  const match = await scope.json() as { issues?: { key?: string }[] };
  if (!match.issues?.some((issue) => issue.key?.toUpperCase() === issueKey.toUpperCase())) {
    throw new Error("Work item is not readable in the configured dashboard scope");
  }
  const response = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog?startAt=${startAt}&maxResults=100`, {
    headers, cache: "no-store", signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Jira worklogs for ${issueKey} returned ${response.status}`);
  return normalizeContributionWorklogPage(issueKey, await response.json());
}

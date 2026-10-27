import { isJiraConfigured, missingJiraConfig, JIRA_CONFIG } from "./config";
import { DashboardData, DashboardFilters, JiraWorkItem, SprintMeta } from "./types";
import { computeDashboardData } from "./metricsEngine";

/**
 * Derive the enterprise quarter id from a Jira sprint name.
 * Handles the different naming conventions used across Jira sites:
 *   "2026-Q3 Iteration 1"          -> "CY26 PI.3"
 *   "DTR 2026 - Q4 - Iteration 2"  -> "CY26 PI.4"
 *   "CY26 PI.3 Sprint 1"           -> "CY26 PI.3"
 */
export function quarterFromSprint(sprintName: string): string {
  if (!sprintName) return "All";

  // Year + quarter: "2026-Q3", "2026 - Q4", "2026 Q3"
  const yq = sprintName.match(/(\d{4})\s*-\s*Q\s*(\d)/i);
  if (yq) {
    return `CY${yq[1].slice(2)} PI.${parseInt(yq[2], 10)}`;
  }

  // Program increment style: "CY26 PI.3", "CY26 PI3"
  const pi = sprintName.match(/CY(\d{2})\s*PI\.?\s*(\d)/i);
  if (pi) {
    return `CY${pi[1]} PI.${parseInt(pi[2], 10)}`;
  }

  return "All";
}

/**
 * Fetches all issues from Jira Cloud with pagination.
 * Read-only. Uses Basic auth from environment variables.
 * Returns the mapped work items plus sprint metadata (state/dates) collected
 * from the Sprint field, so the dashboard can order sprints and reason about
 * the active/future ones without extra board API calls.
 */
async function fetchAllLiveJiraIssues(): Promise<{
  items: JiraWorkItem[];
  sprintMeta: Record<string, SprintMeta>;
}> {
  const { host, email, apiToken } = JIRA_CONFIG;
  const authHeader = Buffer.from(`${email}:${apiToken}`).toString("base64");
  const url = `${host.replace(/\/+$/, "")}/rest/api/3/search/jql`;

  const spField = process.env.JIRA_STORY_POINTS_FIELD || "customfield_10031";
  const sprintField = process.env.JIRA_SPRINT_FIELD || "customfield_10020";
  const podField = process.env.JIRA_POD_FIELD || "customfield_10050";
  const jql = process.env.JIRA_JQL || "project in (DTR)";

  const allIssues: Record<string, unknown>[] = [];
  let nextPageToken: string | undefined = undefined;

  for (let page = 0; page < 50; page++) {
    const requestBody: Record<string, unknown> = {
      jql,
      maxResults: 100,
      fields: [
        "summary",
        "status",
        "issuetype",
        "project",
        "parent",
        "assignee",
        "priority",
        "created",
        "resolutiondate",
        "duedate",
        "timeoriginalestimate",
        spField,
        sprintField,
        podField,
      ],
    };

    if (nextPageToken) {
      requestBody.nextPageToken = nextPageToken;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${authHeader}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      let detail = body;
      try {
        const json = JSON.parse(body) as { errorMessages?: string[]; message?: string };
        detail = json.errorMessages?.join("; ") || json.message || body;
      } catch {
        // Jira sometimes returns HTML for gateway errors.
      }
      throw new Error(
        `Jira API returned ${response.status}: ${String(detail).slice(0, 500)}`
      );
    }

    const json = await response.json();
    if (json.issues && json.issues.length > 0) {
      allIssues.push(...json.issues);
    }

    if (!json.nextPageToken) break;
    nextPageToken = json.nextPageToken;
  }

  const sprintMeta: Record<string, SprintMeta> = {};

  const items = allIssues.map((issue: Record<string, unknown>) => {
    const fields = (issue.fields || {}) as Record<string, unknown>;
    const project = (fields.project || {}) as Record<string, string>;
    const issuetype = (fields.issuetype || {}) as Record<string, string>;
    const status = (fields.status || {}) as Record<string, string>;
    const summary = String(fields.summary || "");
    const issueKey = String(issue.key || "");
    const workType = issuetype.name || "Story";

    const spRaw = fields[spField];
    const storyPoints =
      typeof spRaw === "number" ? spRaw : parseFloat(String(spRaw || "0")) || 0;

    const sprintObj = fields[sprintField];
    const sprints: string[] = [];

    if (Array.isArray(sprintObj)) {
      for (const s of sprintObj) {
        if (s && typeof s.name === "string") {
          const meta = s as { state?: string; startDate?: string; endDate?: string };
          s.name.split(",").forEach((part: string) => {
            const trimmed = part.trim();
            if (trimmed) {
              if (!sprintMeta[trimmed]) {
                sprintMeta[trimmed] = {
                  name: trimmed,
                  state: meta.state,
                  startDate: meta.startDate,
                  endDate: meta.endDate,
                };
              }
              if (!sprints.includes(trimmed)) sprints.push(trimmed);
            }
          });
        }
      }
    } else if (typeof sprintObj === "string") {
      sprintObj.split(",").forEach((part: string) => {
        const trimmed = part.trim();
        if (trimmed && !sprints.includes(trimmed)) {
          sprints.push(trimmed);
        }
      });
    }

    // POD field can be a plain string, or an option object {value, id}
    const podValue = fields[podField];
    const podKey = project.key || "UNKNOWN";
    let podName = project.name || podKey;
    if (typeof podValue === "string" && podValue) {
      podName = podValue;
    } else if (podValue && typeof podValue === "object") {
      const opt = podValue as { value?: string; name?: string };
      if (opt.value) podName = opt.value;
      else if (opt.name) podName = opt.name;
    }

    const assigneeObj = fields.assignee as { displayName?: string } | undefined;
    const priorityObj = fields.priority as { name?: string } | undefined;
    const parentObj = fields.parent as { key?: string; id?: string } | undefined;

    return {
      key: issueKey,
      summary,
      podKey,
      podName,
      workType,
      status: status.name || "To Do",
      priority: priorityObj?.name || "Medium",
      assignee: assigneeObj?.displayName || "Unassigned",
      quarter:
        sprints.length > 0
          ? quarterFromSprint(sprints[sprints.length - 1])
          : "All",
      sprints,
      storyPoints,
      team: project.name || "",
      parentKey: parentObj?.key || "",
      parentId: parentObj?.id || "",
      createdDate: String(fields.created || ""),
      resolutionDate: fields.resolutiondate
        ? String(fields.resolutiondate)
        : undefined,
      dueDate: fields.duedate ? String(fields.duedate) : undefined,
      originalEstimateSeconds: Number(fields.timeoriginalestimate) || 0,
      updatedDate: String(fields.updated || ""),
    };
  });

  return { items, sprintMeta };
}

/**
 * Returns dashboard data from live Jira only.
 * No dummy data, no CSV, no JSON fallback.
 * If Jira is not configured, throws an error.
 *
 * Raw issues are cached in memory for a short TTL so changing a filter does not
 * re-download the whole portfolio from Jira on every request.
 */
const CACHE_TTL_MS = Number(process.env.JIRA_CACHE_TTL_MS || 300000);
let cache: {
  at: number;
  items: JiraWorkItem[];
  sprintMeta: Record<string, SprintMeta>;
} | null = null;

export async function getDashboardData(
  filters: DashboardFilters = { podId: "all", quarterId: "all", sprintId: "all" }
): Promise<DashboardData> {
  if (!isJiraConfigured()) {
    throw new Error(
      `Jira is not configured. Missing ${missingJiraConfig().join(", ")} in .env.local`
    );
  }

  const now = Date.now();
  if (!cache || now - cache.at > CACHE_TTL_MS) {
    const live = await fetchAllLiveJiraIssues();
    cache = { at: now, items: live.items, sprintMeta: live.sprintMeta };
  }

  const baseUrl = (JIRA_CONFIG.host || "").replace(/\/+$/, "");
  return {
    ...computeDashboardData(cache.items, filters, cache.sprintMeta),
    jiraBaseUrl: baseUrl,
  };
}

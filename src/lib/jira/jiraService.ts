import { isJiraConfigured, JIRA_CONFIG } from "./config";
import enterpriseDataRaw from "./enterpriseData.json";
import { computeDashboardData } from "./metricsEngine";
import { DashboardData, DashboardFilters, JiraWorkItem } from "./types";

const fallbackItems: JiraWorkItem[] = enterpriseDataRaw as unknown as JiraWorkItem[];

// Fast lookup maps built once at startup
const quarterMap = new Map<string, string>();
const spMap = new Map<string, number>();
const assigneeMap = new Map<string, string>();
const priorityMap = new Map<string, string>();

enterpriseDataRaw.forEach((item: { key?: string; summary?: string; quarter?: string; storyPoints?: number; assignee?: string; priority?: string }) => {
  if (item.key && item.quarter) quarterMap.set(item.key, item.quarter);
  if (item.summary && item.quarter) quarterMap.set(item.summary.trim().toLowerCase(), item.quarter);
  if (item.key && item.storyPoints && item.storyPoints > 0) spMap.set(item.key, item.storyPoints);
  if (item.summary && item.storyPoints && item.storyPoints > 0) spMap.set(item.summary.trim().toLowerCase(), item.storyPoints);
  if (item.key && item.assignee) assigneeMap.set(item.key, item.assignee);
  if (item.summary && item.assignee) assigneeMap.set(item.summary.trim().toLowerCase(), item.assignee);
  if (item.key && item.priority) priorityMap.set(item.key, item.priority);
  if (item.summary && item.priority) priorityMap.set(item.summary.trim().toLowerCase(), item.priority);
});

// High-speed In-Memory Cache (5 minute TTL)
let cachedLiveIssues: JiraWorkItem[] | null = null;
let lastCacheTime = 0;
let isFetchingLive = false;
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Fetches all issues across the 5 pods from Jira Cloud with pagination and caches them
 */
async function fetchAllLiveJiraIssues(): Promise<JiraWorkItem[]> {
  const { host, email, apiToken } = JIRA_CONFIG;
  const authHeader = Buffer.from(`${email}:${apiToken}`).toString("base64");
  const url = `${host.replace(/\/+$/, "")}/rest/api/3/search/jql`;
  const jql = "project in (CRM, DTP, ERP, SEC, SRG)";

  const allIssues: Record<string, unknown>[] = [];
  let nextPageToken: string | undefined = undefined;

  for (let page = 0; page < 15; page++) {
    const requestBody: Record<string, unknown> = {
      jql,
      maxResults: 100,
      fields: [
        "summary",
        "status",
        "issuetype",
        "project",
        "customfield_10031",
        "customfield_10016",
        "customfield_10020",
        "created",
        "resolutiondate",
        "fixVersions",
        "labels",
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
      throw new Error(`Jira API returned ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();
    if (json.issues && json.issues.length > 0) {
      allIssues.push(...json.issues);
    }

    if (!json.nextPageToken) break;
    nextPageToken = json.nextPageToken;
  }

  return allIssues.map((issue: Record<string, unknown>) => {
    const fields = (issue.fields || {}) as Record<string, unknown>;
    const project = (fields.project || {}) as Record<string, string>;
    const issuetype = (fields.issuetype || {}) as Record<string, string>;
    const status = (fields.status || {}) as Record<string, string>;
    const summary = String(fields.summary || "");
    const issueKey = String(issue.key || "");
    const workType = issuetype.name || "Story";

    // 1. Resolve Story Points (customfield_10031 / 10016 / portfolio map / workType default)
    const spRaw = fields.customfield_10031 ?? fields.customfield_10016 ?? 0;
    let storyPoints = typeof spRaw === "number" ? spRaw : parseFloat(String(spRaw)) || 0;
    if (storyPoints <= 0) {
      const mappedSP = spMap.get(issueKey) || spMap.get(summary.trim().toLowerCase());
      if (mappedSP) {
        storyPoints = mappedSP;
      } else if (workType === "Story") {
        storyPoints = 5;
      } else if (workType === "Bug") {
        storyPoints = 3;
      } else if (workType === "Task") {
        storyPoints = 2;
      }
    }

    // 2. Resolve Sprints (parse customfield_10020 and split any comma-separated values)
    const sprints: string[] = [];
    const sprintObj = fields.customfield_10020;
    if (Array.isArray(sprintObj)) {
      for (const s of sprintObj) {
        if (s && typeof s.name === "string") {
          s.name.split(",").forEach((part: string) => {
            const trimmed = part.trim();
            if (trimmed && !sprints.includes(trimmed)) {
              sprints.push(trimmed);
            }
          });
        }
      }
    }

    // 3. Resolve Quarter / Program Increment
    const quarter =
      quarterMap.get(issueKey) ||
      quarterMap.get(summary.trim().toLowerCase()) ||
      "CY26 PI.1";

    const assigneeObj = fields.assignee as { displayName?: string } | undefined;
    const priorityObj = fields.priority as { name?: string } | undefined;
    const assignee =
      assigneeObj?.displayName ||
      assigneeMap.get(issueKey) ||
      assigneeMap.get(summary.trim().toLowerCase()) ||
      "Unassigned";
    const priority =
      priorityObj?.name ||
      priorityMap.get(issueKey) ||
      priorityMap.get(summary.trim().toLowerCase()) ||
      "Medium";

    return {
      key: issueKey,
      summary,
      podKey: project.key || "CRM",
      podName: project.name || "Customer Relationship Management",
      workType,
      status: status.name || "To Do",
      priority,
      assignee,
      quarter,
      sprints,
      storyPoints,
      team: project.name || "",
      createdDate: String(fields.created || ""),
      resolutionDate: fields.resolutiondate ? String(fields.resolutiondate) : undefined,
    };
  });
}

/**
 * Returns dashboard data with high-speed in-memory caching.
 * Live fetch is performed once and cached; filter operations execute in <1ms!
 */
export async function getDashboardData(
  filters: DashboardFilters = { podId: "all", quarterId: "all", sprintId: "all" }
): Promise<DashboardData> {
  let items: JiraWorkItem[] = fallbackItems;

  if (isJiraConfigured()) {
    const now = Date.now();
    const isCacheValid = cachedLiveIssues && now - lastCacheTime < CACHE_TTL_MS;

    if (isCacheValid) {
      items = cachedLiveIssues!;
    } else if (!isFetchingLive) {
      isFetchingLive = true;
      try {
        const liveItems = await fetchAllLiveJiraIssues();
        if (liveItems.length > 0) {
          cachedLiveIssues = liveItems;
          lastCacheTime = now;
          items = liveItems;
        }
      } catch (error) {
        console.warn("Live Jira fetch failed, falling back to cache or portfolio dataset:", error);
        if (cachedLiveIssues) items = cachedLiveIssues;
      } finally {
        isFetchingLive = false;
      }
    } else if (cachedLiveIssues) {
      items = cachedLiveIssues;
    }
  }

  return computeDashboardData(items, filters);
}

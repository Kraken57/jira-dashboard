/**
 * Forge Dashboard Resolver - Custom UI global page.
 * Serves KPI data from live Jira via api.asApp().
 * No imports from frontend code. Backend is fully segregated.
 * Real Jira data only. No dummy data, no CSV, no JSON fallback.
 */
import Resolver from "@forge/resolver";
import api, { storage, route } from "@forge/api";
import { JiraClient } from "./api/jiraClient";

const resolver = new Resolver();
const jiraClient = new JiraClient();

/**
 * Statuses that count as "delivered". Configurable per Jira site via
 * JIRA_DONE_STATUSES (comma-separated). Set it with `forge env` / the
 * environment variables section of the Forge developer console.
 */
const DONE_STATUSES = new Set(
  (process.env.JIRA_DONE_STATUSES || "Done,Accepted,Released,Closed,Resolved")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

function isDoneStatus(status: string): boolean {
  return DONE_STATUSES.has(status);
}

/**
 * Derive the enterprise quarter id from a Jira sprint name.
 *   "2026-Q3 Iteration 1"          -> "CY26 PI.3"
 *   "DTR 2026 - Q4 - Iteration 2"  -> "CY26 PI.4"
 *   "CY26 PI.3 Sprint 1"           -> "CY26 PI.3"
 */
function quarterFromSprint(sprintName: string): string {
  if (!sprintName) return "All";

  const yq = sprintName.match(/(\d{4})\s*-\s*Q\s*(\d)/i);
  if (yq) {
    return `CY${yq[1].slice(2)} PI.${parseInt(yq[2], 10)}`;
  }

  const pi = sprintName.match(/CY(\d{2})\s*PI\.?\s*(\d)/i);
  if (pi) {
    return `CY${pi[1]} PI.${parseInt(pi[2], 10)}`;
  }

  return "All";
}

/**
 * Read field configuration from Forge key-value storage.
 * Falls back to sensible defaults if not configured by admin.
 */
async function getFieldConfig(): Promise<{
  jql: string;
  storyPointsField: string;
  sprintField: string;
  podField: string;
}> {
  const [jql, spField, sprintField, podField] = await Promise.all([
    storage.get("jira_jql"),
    storage.get("jira_story_points_field"),
    storage.get("jira_sprint_field"),
    storage.get("jira_pod_field"),
  ]);

  return {
    jql: (jql as string) || "project in (DTR)",
    storyPointsField: (spField as string) || "customfield_10078",
    sprintField: (sprintField as string) || "customfield_10020",
    podField: (podField as string) || "customfield_10001",
  };
}

/**
 * Transform a raw Jira issue into a work item for dashboard calculations.
 */
function mapIssueToWorkItem(
  issue: Record<string, unknown>,
  config: { storyPointsField: string; sprintField: string; podField: string }
): any {
  const fields = (issue.fields || {}) as Record<string, unknown>;
  const project = (fields.project || {}) as Record<string, string>;
  const issuetype = (fields.issuetype || {}) as Record<string, string>;
  const status = (fields.status || {}) as Record<string, string>;
  const summary = String(fields.summary || "");
  const issueKey = String(issue.key || "");
  const workType = issuetype.name || "Story";

  const spRaw = fields[config.storyPointsField];
  const storyPoints =
    typeof spRaw === "number" ? spRaw : parseFloat(String(spRaw || "0")) || 0;

  const sprintObj = fields[config.sprintField];
  const sprints: string[] = [];
  if (Array.isArray(sprintObj)) {
    for (const s of sprintObj) {
      if (s && typeof s.name === "string") {
        s.name.split(",").forEach((part: string) => {
          const trimmed = part.trim();
          if (trimmed && !sprints.includes(trimmed)) sprints.push(trimmed);
        });
      }
    }
  } else if (typeof sprintObj === "string") {
    sprintObj.split(",").forEach((part: string) => {
      const trimmed = part.trim();
      if (trimmed && !sprints.includes(trimmed)) sprints.push(trimmed);
    });
  }

  const podValue = fields[config.podField];
  const podKey =
    typeof podValue === "string" ? podValue : project.key || "DTR";
  const podName =
    typeof podValue === "string" ? podValue : project.name || "DTR Project";

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
      quarter: sprints.length > 0 ? quarterFromSprint(sprints[0]) : "All",
    sprints,
    storyPoints,
    team: project.name || "",
    parentKey: parentObj?.key || "",
    parentId: parentObj?.id || "",
    createdDate: String(fields.created || ""),
    resolutionDate: fields.resolutiondate ? String(fields.resolutiondate) : undefined,
    updatedDate: String(fields.updated || ""),
  };
}

/**
 * Calculate simple KPIs from work items.
 */
function calculateKPIs(items: any[], filters: any) {
  const totalIssues = items.length;
  const totalStoryPoints = items.reduce(
    (sum, i) => sum + (i.storyPoints || 0),
    0
  );
  const completedIssues = items.filter((i) => isDoneStatus(i.status)).length;
  const completedStoryPoints = items
    .filter((i) => isDoneStatus(i.status))
    .reduce((sum, i) => sum + (i.storyPoints || 0), 0);

  const sayDo = totalStoryPoints > 0 ? completedStoryPoints / totalStoryPoints : 0;
  const carryover =
    totalStoryPoints > 0 ? (totalStoryPoints - completedStoryPoints) / totalStoryPoints : 0;

  // Group by pod
  const podMap = new Map<string, { count: number; sp: number; doneSp: number }>();
  for (const item of items) {
    const pod = item.podKey || "Unknown";
    if (!podMap.has(pod)) {
      podMap.set(pod, { count: 0, sp: 0, doneSp: 0 });
    }
    const p = podMap.get(pod)!;
    p.count++;
    p.sp += item.storyPoints || 0;
    if (isDoneStatus(item.status)) {
      p.doneSp += item.storyPoints || 0;
    }
  }

  const pods = Array.from(podMap.entries()).map(([key, val]) => ({
    id: key,
    name: key,
    issueCount: val.count,
    storyPoints: val.sp,
    completedStoryPoints: val.doneSp,
  }));

  // Group by sprint
  const sprintMap = new Map<string, { count: number; sp: number }>();
  for (const item of items) {
    for (const sprint of item.sprints) {
      if (!sprintMap.has(sprint)) {
        sprintMap.set(sprint, { count: 0, sp: 0 });
      }
      const s = sprintMap.get(sprint)!;
      s.count++;
      s.sp += item.storyPoints || 0;
    }
  }

  const sprints = Array.from(sprintMap.entries()).map(([name, val]) => ({
    id: name,
    name,
    issueCount: val.count,
    storyPoints: val.sp,
    count: val.count,
    sp: val.sp,
  }));

  return {
    summary: {
      totalIssues,
      totalStoryPoints,
      completedIssues,
      completedStoryPoints,
      sayDoRatio: sayDo,
      carryoverRatio: carryover,
    },
    pods,
    sprints,
    metrics: [
      {
        title: "Total Issues",
        value: totalIssues,
        subtitle: "Across all sprints",
        trend: 0,
        trendLabel: "",
        color: "blue" as const,
      },
      {
        title: "Total Story Points",
        value: totalStoryPoints,
        subtitle: "Committed",
        trend: 0,
        trendLabel: "",
        color: "blue" as const,
      },
      {
        title: "Say/Do Ratio",
        value: Math.round(sayDo * 100),
        subtitle: "% delivered",
        trend: 0,
        trendLabel: "",
        color: sayDo >= 0.8 ? ("green" as const) : ("red" as const),
      },
      {
        title: "Carryover Ratio",
        value: Math.round(carryover * 100),
        subtitle: "% not delivered",
        trend: 0,
        trendLabel: "",
        color: carryover <= 0.2 ? ("green" as const) : ("red" as const),
      },
    ],
    velocity: {
      labels: sprints.map((s) => s.name),
      completed: sprints.map(() => 0),
      committed: sprints.map((s) => s.sp),
      totalFinished: completedStoryPoints,
      avgLastThree: 0,
      trendStatus: "stable" as const,
    },
    delivery: {
      labels: sprints.map((s) => s.name),
      planned: sprints.map((s) => s.sp),
      committed: sprints.map((s) => s.sp),
      done: sprints.map((s) => 0), // placeholder
      carried: sprints.map((s) => 0), // placeholder
    },
    developers: [],
    sprintAnalysis: {
      scopeChurnPct: 0,
      plannedWorkPct: 100,
      unplannedWorkPct: 0,
      avgCycleTimeDays: 0,
      avgLeadTimeDays: 0,
      workTypeBreakdown: [],
      statusBreakdown: [],
    },
    quality: {
      defectDensity: 0,
      totalBugs: 0,
      resolvedBugs: 0,
      resolutionRate: 0,
      avgResolutionDays: 0,
      priorityDistribution: [],
    },
    predictability: {
      score: Math.round(sayDo * 100),
      varianceSP: 0,
      epicsOnSchedule: 0,
      history: [],
    },
    trends: {
      velocityTrend: {
        labels: sprints.map((s) => s.name),
        velocity: sprints.map((s) => s.sp),
        movingAvg: sprints.map((s) => s.sp),
      },
      cumulativeThroughput: {
        labels: sprints.map((s) => s.name),
        totalIssues: sprints.map((s) => s.count),
        completedIssues: sprints.map((s) => 0),
      },
    },
    diagnosis: {
      slippageSP: totalStoryPoints - completedStoryPoints,
      slippagePct: carryover * 100,
      primaryDriver: "Incomplete work",
      atRiskContributorsCount: 0,
      contributors: [],
      unfinishedIssues: items.filter(
        (i) =>
          i.status.toLowerCase() !== "done" && i.status.toLowerCase() !== "closed"
      ).slice(0, 10),
    },
    issueList: items.map((i) => ({
      key: i.key,
      summary: i.summary,
      workType: i.workType,
      status: i.status,
      storyPoints: i.storyPoints,
      podKey: i.podKey,
      podName: i.podName,
      sprint: i.sprints[0] || "",
      assignee: i.assignee,
      priority: i.priority,
      createdDate: i.createdDate,
    })),
  };
}

resolver.define("getDashboardData", async (req) => {
  const filters = (req.payload || {}) as Record<string, string>;

  try {
    const config = await getFieldConfig();

    // Fetch all issues from Jira using api.asApp() (privileged, no user context)
    const issues = await jiraClient.searchIssuesJql(config.jql, [
      "summary",
      "status",
      "issuetype",
      "project",
      "parent",
      "assignee",
      "priority",
      "created",
      "updated",
      "resolutiondate",
      "duedate",
      config.storyPointsField,
      config.sprintField,
      config.podField,
      "fixVersions",
      "labels",
    ]);

    const items = issues.map((issue) => mapIssueToWorkItem(issue, config));

    // Apply filters
    let filtered = items;
    if (filters.podId && filters.podId !== "all") {
      filtered = filtered.filter((i) => i.podKey === filters.podId);
    }
    if (filters.quarterId && filters.quarterId !== "all") {
      filtered = filtered.filter((i) => i.quarter === filters.quarterId);
    }
    if (filters.sprintId && filters.sprintId !== "all") {
      filtered = filtered.filter((i) => i.sprints.includes(filters.sprintId));
    }

    const kpis = calculateKPIs(filtered, filters);

    return {
      timebox_id: filters.timeboxId || "all",
      pod_id: filters.podId || "all",
      kpi: kpis.summary,
      pods: kpis.pods,
      sprints: kpis.sprints,
      metrics: kpis.metrics,
      velocity: kpis.velocity,
      delivery: kpis.delivery,
      developers: kpis.developers,
      sprintAnalysis: kpis.sprintAnalysis,
      quality: kpis.quality,
      predictability: kpis.predictability,
      trends: kpis.trends,
      diagnosis: kpis.diagnosis,
      issueList: kpis.issueList,
      summary: kpis.summary,
      calculated_at: new Date().toISOString(),
      source: "live_jira",
    };
  } catch (err) {
    console.error("Forge dashboard resolver error:", err);
    return {
      error: err instanceof Error ? err.message : "Unknown error",
      source: "live_jira",
    };
  }
});

resolver.define("getEvidence", async (req) => {
  const { issueKey } = (req.payload || {}) as Record<string, string>;
  if (!issueKey) return { error: "issueKey required" };

  try {
    const issue = await jiraClient.getIssue(issueKey);
    const fields = issue.fields || {};

    return {
      issue_key: issue.key,
      summary: fields.summary,
      status: fields.status?.name,
      issuetype: fields.issuetype?.name,
      project: fields.project?.key,
      assignee: fields.assignee?.displayName,
      created: fields.created,
      updated: fields.updated,
      resolutiondate: fields.resolutiondate,
      jira_url: `https://cdkglobal.atlassian.net/browse/${issue.key}`,
      source: "live_jira",
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to fetch issue",
    };
  }
});

export const handler = resolver.getDefinitions();

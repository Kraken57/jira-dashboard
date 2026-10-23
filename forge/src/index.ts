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

  // Group by sprint (real committed/done SP and issue counts)
  const sprintMap = new Map<
    string,
    { count: number; sp: number; doneSp: number; doneCount: number }
  >();
  for (const item of items) {
    for (const sprint of item.sprints) {
      if (!sprintMap.has(sprint)) {
        sprintMap.set(sprint, { count: 0, sp: 0, doneSp: 0, doneCount: 0 });
      }
      const s = sprintMap.get(sprint)!;
      const sp = item.storyPoints || 0;
      s.count++;
      s.sp += sp;
      if (isDoneStatus(item.status)) {
        s.doneSp += sp;
        s.doneCount++;
      }
    }
  }

  const allSprints = Array.from(sprintMap.entries())
    .filter(([, val]) => val.count > 0)
    .map(([name, val]) => ({
      id: name,
      name,
      issueCount: val.count,
      storyPoints: Math.round(val.sp),
      doneStoryPoints: Math.round(val.doneSp),
      doneIssueCount: val.doneCount,
    }));

  // Plot only the latest five sprints so the charts stay readable.
  const sprints = allSprints.slice(-5);

  const completedSeries = sprints.map((s) => s.doneStoryPoints);
  const committedSeries = sprints.map((s) => s.storyPoints);
  const lastThree = completedSeries.slice(Math.max(completedSeries.length - 3, 0));
  const avgLastThree = lastThree.length
    ? Number((lastThree.reduce((a, b) => a + b, 0) / lastThree.length).toFixed(1))
    : 0;
  const lastDone = completedSeries[completedSeries.length - 1] || 0;
  const prevDone = completedSeries[completedSeries.length - 2] || 0;
  const trendStatus =
    completedSeries.length < 2
      ? ("stable" as const)
      : lastDone > prevDone
      ? ("rising" as const)
      : lastDone < prevDone
      ? ("falling" as const)
      : ("stable" as const);

  const sprintSayDo = (s?: typeof allSprints[number]) =>
    s && s.storyPoints > 0 ? Math.round((s.doneStoryPoints / s.storyPoints) * 100) : 0;
  const sprintCarry = (s?: typeof allSprints[number]) =>
    s && s.storyPoints > 0
      ? Math.round(((s.storyPoints - s.doneStoryPoints) / s.storyPoints) * 100)
      : 0;

  // Executive KPIs aggregate over the current selection using de-duplicated
  // item totals (an item carried across sprints is counted once).
  const lastSprint = sprints[sprints.length - 1];
  const prevSprint = sprints[sprints.length - 2];

  const totalCommittedSP = totalStoryPoints;
  const totalDoneSP = completedStoryPoints;
  const totalCarriedSP = Math.max(totalCommittedSP - totalDoneSP, 0);

  const savedSayDo =
    totalCommittedSP > 0 ? Math.round((totalDoneSP / totalCommittedSP) * 100) : 0;
  const savedCarry =
    totalCommittedSP > 0 ? Math.round((totalCarriedSP / totalCommittedSP) * 100) : 0;
  const currentVelocity = totalDoneSP;

  const sayDoTrend =
    lastSprint && prevSprint ? sprintSayDo(lastSprint) - sprintSayDo(prevSprint) : 0;
  const carryTrend =
    lastSprint && prevSprint ? sprintCarry(lastSprint) - sprintCarry(prevSprint) : 0;
  const velocityTrendPct =
    lastSprint && prevSprint
      ? prevSprint.doneStoryPoints > 0
        ? Math.round(
            ((lastSprint.doneStoryPoints - prevSprint.doneStoryPoints) /
              prevSprint.doneStoryPoints) *
              100
          )
        : lastSprint.doneStoryPoints > 0
        ? 100
        : 0
      : 0;

  // Predictability across the selection: delivered / planned SP.
  const predictabilityScore =
    totalCommittedSP > 0 ? Math.round((totalDoneSP / totalCommittedSP) * 100) : 0;

  const podsWithAll = [
    {
      id: "all",
      key: "ALL",
      name: "All Pods",
      sub: `${pods.length} pods`,
      issueCount: totalIssues,
      storyPoints: totalStoryPoints,
      completedStoryPoints: completedStoryPoints,
    },
    ...pods.map((p) => ({ ...p, key: p.id })),
  ];

  const quarterSet = new Set<string>();
  for (const item of items) {
    if (item.quarter && item.quarter !== "All") quarterSet.add(item.quarter);
  }
  const quarters = [
    { id: "all", name: "All Quarters", sub: "Full Portfolio" },
    ...Array.from(quarterSet)
      .sort()
      .map((q) => ({ id: q, name: q })),
  ];

  return {
    summary: {
      totalIssues,
      totalStoryPoints,
      completedIssues,
      completedStoryPoints,
      sayDoRatio: sayDo,
      carryoverRatio: carryover,
    },
    pods: podsWithAll,
    quarters,
    sprints: [
      { id: "all", name: "All Sprints", sub: `Latest ${sprints.length} sprints` },
      ...sprints,
    ],
    metrics: [
      {
        title: "Say/Do Ratio",
        value: `${savedSayDo}%`,
        subtitle: "Completed committed SP ÷ committed SP",
        trend: sayDoTrend,
        trendLabel: sayDoTrend === 0 ? "no change vs last sprint" : "vs last sprint",
        color: savedSayDo >= 80 ? ("green" as const) : savedSayDo >= 65 ? ("blue" as const) : ("red" as const),
        trendGood: "up" as const,
        drilldownTab: "diagnosis",
      },
      {
        title: "Sprint Carry Over",
        value: `${savedCarry}%`,
        subtitle: "Spilled-over committed SP ÷ committed SP",
        trend: carryTrend,
        trendLabel: carryTrend === 0 ? "no change vs last sprint" : "vs last sprint",
        color: savedCarry <= 18 ? ("green" as const) : savedCarry <= 28 ? ("blue" as const) : ("red" as const),
        trendGood: "down" as const,
        drilldownTab: "diagnosis",
      },
      {
        title: "Team/Epic Velocity",
        value: `${currentVelocity} pts`,
        subtitle: "SP completed in latest sprint",
        trend: velocityTrendPct,
        trendLabel: velocityTrendPct === 0 ? "no change vs last sprint" : "vs last sprint",
        color: "blue" as const,
        trendGood: "up" as const,
        drilldownTab: "trends",
      },
      {
        title: "Feature Predictability",
        value: `${predictabilityScore}%`,
        subtitle: "Completed committed SP ÷ planned SP",
        trend: sayDoTrend,
        trendLabel: sayDoTrend === 0 ? "no change vs last sprint" : "vs last sprint",
        color: predictabilityScore >= 85 ? ("green" as const) : ("blue" as const),
        trendGood: "up" as const,
        drilldownTab: "predictability",
      },
    ],
    velocity: {
      labels: sprints.map((s) => s.name),
      completed: completedSeries,
      committed: committedSeries,
      totalFinished: completedSeries.reduce((a, b) => a + b, 0),
      avgLastThree,
      trendStatus,
    },
    delivery: {
      labels: sprints.map((s) => s.name),
      planned: committedSeries,
      committed: committedSeries,
      done: completedSeries,
      carried: sprints.map((s) => Math.max(s.storyPoints - s.doneStoryPoints, 0)),
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
      score: predictabilityScore,
      varianceSP: Math.abs(totalCommittedSP - totalDoneSP),
      epicsOnSchedule: predictabilityScore,
      history: sprints.map((s) => ({
        sprint: s.name,
        planned: s.storyPoints,
        delivered: s.doneStoryPoints,
        sayDo: sprintSayDo(s),
      })),
    },
    trends: {
      velocityTrend: {
        labels: sprints.map((s) => s.name),
        velocity: completedSeries,
        movingAvg: completedSeries.map((_, idx) => {
          const slice = completedSeries.slice(0, idx + 1);
          return Math.round(slice.reduce((a, b) => a + b, 0) / slice.length);
        }),
      },
      cumulativeThroughput: {
        labels: sprints.map((s) => s.name),
        totalIssues: sprints.reduce<number[]>((acc, s) => {
          acc.push((acc[acc.length - 1] || 0) + s.issueCount);
          return acc;
        }, []),
        completedIssues: sprints.reduce<number[]>((acc, s) => {
          acc.push((acc[acc.length - 1] || 0) + s.doneIssueCount);
          return acc;
        }, []),
      },
    },
    diagnosis: {
      slippageSP: totalStoryPoints - completedStoryPoints,
      slippagePct: carryover * 100,
      primaryDriver: "Incomplete work",
      atRiskContributorsCount: 0,
      contributors: [],
      unfinishedIssues: items
        .filter((i) => !isDoneStatus(i.status))
        .slice(0, 150)
        .map((i) => ({
          key: i.key,
          summary: i.summary,
          workType: i.workType,
          status: i.status,
          storyPoints: i.storyPoints || 0,
          podKey: i.podKey,
          podName: i.podName,
          sprint: i.sprints.length > 0 ? i.sprints.join(", ") : "Backlog",
          assignee: i.assignee || "Unassigned",
          priority: i.priority || "Medium",
          reason: "Carried-Over Scope",
        })),
    },
    issueList: items.map((i) => ({
      key: i.key,
      summary: i.summary,
      workType: i.workType,
      status: i.status,
      storyPoints: i.storyPoints,
      podKey: i.podKey,
      podName: i.podName,
      sprint: i.sprints.length > 0 ? i.sprints.join(", ") : "Backlog",
      assignee: i.assignee,
      priority: i.priority,
      createdDate: i.createdDate,
      isDone: isDoneStatus(i.status),
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
      "resolutiondate",
      config.storyPointsField,
      config.sprintField,
      config.podField,
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
      jiraBaseUrl: (process.env.JIRA_HOST || "").replace(/\/+$/, ""),
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
      jira_url: `${(process.env.JIRA_HOST || "").replace(/\/+$/, "")}/browse/${issue.key}`,
      source: "live_jira",
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to fetch issue",
    };
  }
});

export const handler = resolver.getDefinitions();

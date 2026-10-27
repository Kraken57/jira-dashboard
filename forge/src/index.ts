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

const SUBTASK_DONE_STATUSES = new Set(
  (
    process.env.JIRA_SUBTASK_DONE_STATUSES ||
    "Done,Closed,Resolved,Completed,Released,Accepted"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

function isSubtaskDoneStatus(status: string): boolean {
  return DONE_STATUSES.has(status) || SUBTASK_DONE_STATUSES.has(status);
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

const DAY_MS = 86_400_000;
const RATE_WINDOW_DAYS = 30;

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/** Weekdays between two instants; the deadline day is excluded. */
function workingDaysBetween(startMs: number, endMs: number): number {
  const cursor = new Date(startMs);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(endMs);
  end.setHours(0, 0, 0, 0);
  let days = 0;
  while (cursor < end) {
    if (!isWeekend(cursor)) days += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/**
 * Future Predictability — same math as the frontend metrics engine.
 * Remaining work is the sum of open child story points; a feature's own points
 * are used only when it has no estimated children. Capacity uses weekdays.
 */
function computeFuturePredictability(items: any[], childSource: any[] = items) {
  const now = Date.now();
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const rateStart = startOfToday - RATE_WINDOW_DAYS * DAY_MS;
  const recentDoneSP = childSource
    .filter(
      (it: any) =>
        isDoneStatus(it.status) &&
        it.resolutionDate &&
        new Date(it.resolutionDate).getTime() >= rateStart &&
        new Date(it.resolutionDate).getTime() <= now
    )
    .reduce((sum: number, it: any) => sum + (it.storyPoints || 0), 0);
  const rateWorkingDays = Math.max(1, workingDaysBetween(rateStart, now + DAY_MS));
  const dailyRate = recentDoneSP / rateWorkingDays;

  const hasFeatureType = childSource.some((it: any) => /^feature$/i.test(it.workType));
  const isFeature = (it: any) =>
    hasFeatureType ? /^feature$/i.test(it.workType) : /^epic$/i.test(it.workType);

  const isFutureDated = (it: any) =>
    !!it.dueDate && new Date(it.dueDate).getTime() >= startOfToday;

  const childrenByParent = new Map<string, any[]>();
  childSource.forEach((it: any) => {
    if (!it.parentKey) return;
    if (/^sub-?task$/i.test(it.workType)) return;
    if (!childrenByParent.has(it.parentKey)) childrenByParent.set(it.parentKey, []);
    childrenByParent.get(it.parentKey)!.push(it);
  });

  const remainingUnder = (
    item: any,
    seen = new Set<string>()
  ): { remaining: number; hasEstimate: boolean } => {
    if (seen.has(item.key)) return { remaining: 0, hasEstimate: false };
    seen.add(item.key);
    const children = childrenByParent.get(item.key) || [];
    if (children.length === 0) {
      const sp = item.storyPoints || 0;
      return { remaining: isDoneStatus(item.status) ? 0 : sp, hasEstimate: sp > 0 };
    }
    let remaining = 0;
    let hasEstimate = false;
    for (const child of children) {
      const childResult = remainingUnder(child, seen);
      hasEstimate = hasEstimate || childResult.hasEstimate;
      if (!isDoneStatus(child.status)) remaining += childResult.remaining;
    }
    if (!hasEstimate && (item.storyPoints || 0) > 0) {
      return {
        remaining: isDoneStatus(item.status) ? 0 : item.storyPoints || 0,
        hasEstimate: true,
      };
    }
    return { remaining, hasEstimate };
  };

  const planned = items.filter(
    (it: any) => isFeature(it) && !isDoneStatus(it.status) && isFutureDated(it)
  );
  const pastDue = items.filter(
    (it: any) => isFeature(it) && !isDoneStatus(it.status) && !isFutureDated(it) && !!it.dueDate
  );

  const forecastable = planned.filter((it: any) => remainingUnder(it).hasEstimate);
  const onTimeCount = forecastable.filter((it: any) => {
    const { remaining } = remainingUnder(it);
    if (dailyRate <= 0) return remaining === 0;
    const days = workingDaysBetween(startOfToday, new Date(it.dueDate).getTime());
    return remaining <= dailyRate * days;
  }).length;

  const reasons = new Map<string, string>();
  planned.forEach((it: any) => {
    const { remaining, hasEstimate } = remainingUnder(it);
    if (!hasEstimate) {
      reasons.set(it.key, "No Estimate (add story points to child work)");
      return;
    }
    if (dailyRate <= 0) {
      reasons.set(
        it.key,
        remaining === 0 ? "On Forecast (no remaining work)" : "At Risk (no recent delivery rate)"
      );
      return;
    }
    const days = workingDaysBetween(startOfToday, new Date(it.dueDate).getTime());
    const capacity = Math.round(dailyRate * days * 10) / 10;
    reasons.set(
      it.key,
      remaining <= dailyRate * days
        ? `On Forecast (${remaining} SP ≤ ${capacity} SP capacity in ${days} working days)`
        : `At Risk (${remaining} SP > ${capacity} SP capacity in ${days} working days)`
    );
  });
  pastDue.forEach((it: any) => reasons.set(it.key, "Past Due (missed due date)"));

  return {
    dailyRate: Math.round(dailyRate * 10) / 10,
    rateWorkingDays,
    plannedCount: planned.length,
    forecastableCount: forecastable.length,
    unestimatedCount: planned.length - forecastable.length,
    onTimeCount,
    pastDueCount: pastDue.length,
    score:
      forecastable.length > 0
        ? Math.round((onTimeCount / forecastable.length) * 100)
        : 0,
    reasons,
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
    dueDate: fields.duedate ? String(fields.duedate) : undefined,
    originalEstimateSeconds: Number(fields.timeoriginalestimate) || 0,
    updatedDate: String(fields.updated || ""),
  };
}

/**
 * Sub-tasks often have no sprint/quarter of their own. Inherit those from the
 * parent before filters run so Developer View stays complete.
 */
function inheritParentContext(items: any[]): any[] {
  const byKey = new Map(items.map((i) => [i.key, i]));
  return items.map((i) => {
    if (!/^sub-?task$/i.test(i.workType) || !i.parentKey) return i;
    const parent = byKey.get(i.parentKey);
    if (!parent) return i;
    return {
      ...i,
      sprints: i.sprints && i.sprints.length > 0 ? i.sprints : parent.sprints,
      quarter: i.quarter && i.quarter !== "All" ? i.quarter : parent.quarter,
      podName: i.podName && i.podName !== i.team ? i.podName : parent.podName,
      team: i.team || parent.team,
    };
  });
}

/**
 * Calculate simple KPIs from work items.
 */
function calculateKPIs(
  items: any[],
  filters: any,
  developerSource: any[] = items,
  forecastSource: any[] = items,
  forecastChildSource: any[] = forecastSource
) {
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
  let currentVelocity = totalDoneSP;
  let velocityPodCount = 0;

  // Global All Pods / All Quarters / All Sprints: average each pod's sprint
  // velocity first, then average the pods. Other filter combinations keep the
  // existing calculation.
  const isGlobalAll =
    (!filters.podId || filters.podId === "all") &&
    (!filters.quarterId || filters.quarterId === "all") &&
    (!filters.sprintId || filters.sprintId === "all");
  let globalVelocityTrend: number | null = null;
  if (isGlobalAll) {
    // Velocity only counts accepted (done) items with real story points.
    const velocityItems = items.filter(
      (item) => isDoneStatus(item.status) && (item.storyPoints || 0) > 0
    );
    const podPools = new Map<string, any[]>();
    for (const item of velocityItems) {
      const key = item.podKey || "UNKNOWN";
      if (!podPools.has(key)) podPools.set(key, []);
      podPools.get(key)!.push(item);
    }

    const podAverages: number[] = [];
    podPools.forEach((pool) => {
      const podSprints = sprints.filter((s) =>
        pool.some((i) => i.sprints.includes(s.name))
      );
      if (!podSprints.length) return;
      const perSprint = podSprints.map((s) =>
        pool
          .filter((i) => i.sprints.includes(s.name) && isDoneStatus(i.status))
          .reduce((sum, i) => sum + (i.storyPoints || 0), 0)
      );
      podAverages.push(
        perSprint.reduce((a, b) => a + b, 0) / perSprint.length
      );
    });

    velocityPodCount = podAverages.length;
    currentVelocity = podAverages.length
      ? Math.round(
          podAverages.reduce((a, b) => a + b, 0) / podAverages.length
        )
      : 0;

    if (lastSprint && prevSprint) {
      const podAvgForSprint = (name: string) => {
        const vals: number[] = [];
        podPools.forEach((pool) => {
          if (!pool.some((i) => i.sprints.includes(name))) return;
          vals.push(
            pool
              .filter((i) => i.sprints.includes(name) && isDoneStatus(i.status))
              .reduce((sum, i) => sum + (i.storyPoints || 0), 0)
          );
        });
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      };
      const latest = podAvgForSprint(lastSprint.name);
      const previous = podAvgForSprint(prevSprint.name);
      globalVelocityTrend =
        previous > 0 ? Math.round(((latest - previous) / previous) * 100) : latest > 0 ? 100 : 0;
    }
  }

  const sayDoTrend =
    lastSprint && prevSprint ? sprintSayDo(lastSprint) - sprintSayDo(prevSprint) : 0;
  const carryTrend =
    lastSprint && prevSprint ? sprintCarry(lastSprint) - sprintCarry(prevSprint) : 0;
  const velocityTrendPct =
    globalVelocityTrend !== null
      ? globalVelocityTrend
      : lastSprint && prevSprint
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

  const futureForecast = computeFuturePredictability(forecastSource, forecastChildSource);

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

  // Developer View is Story + Sub-task only. developerSource keeps subtasks,
  // which are excluded from every other metric.
  const estimateHours = (seconds: any) =>
    Math.round(((Number(seconds) || 0) / 3600) * 10) / 10;
  const devItems = developerSource.filter((i: any) =>
    /^(story|sub-?task)$/i.test(i.workType)
  );
  const devMap = new Map<string, any>();
  for (const it of devItems) {
    const name = it.assignee || "Unassigned";
    const stat = devMap.get(name) || {
      name,
      team: it.team || it.podName,
      assigned: 0,
      done: 0,
      stories: 0,
      subtasks: 0,
      completedStories: 0,
      completedSubtasks: 0,
      deliveredSP: 0,
      totalSP: 0,
      originalEstimateSeconds: 0,
      completedEstimateSeconds: 0,
    };
    const isSubtask = /^sub-?task$/i.test(it.workType);
    const done = isSubtask ? isSubtaskDoneStatus(it.status) : isDoneStatus(it.status);
    stat.assigned += 1;
    stat.totalSP += it.storyPoints || 0;
    stat.originalEstimateSeconds += it.originalEstimateSeconds || 0;
    if (isSubtask) stat.subtasks += 1;
    else stat.stories += 1;
    if (done) {
      stat.done += 1;
      stat.deliveredSP += it.storyPoints || 0;
      stat.completedEstimateSeconds += it.originalEstimateSeconds || 0;
      if (isSubtask) stat.completedSubtasks += 1;
      else stat.completedStories += 1;
    }
    devMap.set(name, stat);
  }
  const developers = Array.from(devMap.values())
    .map((stat) => ({
      name: stat.name,
      team: stat.team,
      assignedIssues: stat.assigned,
      completedIssues: stat.done,
      assignedStories: stat.stories,
      assignedSubtasks: stat.subtasks,
      completedStories: stat.completedStories,
      completedSubtasks: stat.completedSubtasks,
      deliveredSP: Math.round(stat.deliveredSP),
      totalSP: Math.round(stat.totalSP),
      originalEstimateHours: estimateHours(stat.originalEstimateSeconds),
      completedEstimateHours: estimateHours(stat.completedEstimateSeconds),
      completionRate:
        stat.assigned > 0 ? Math.round((stat.done / stat.assigned) * 100) : 0,
    }))
    .sort((a, b) => b.deliveredSP - a.deliveredSP);

  const developerIssueList = devItems.map((i: any) => ({
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
    createdDate: i.createdDate || "",
    isDone: /^sub-?task$/i.test(i.workType)
      ? isSubtaskDoneStatus(i.status)
      : isDoneStatus(i.status),
    originalEstimateHours: estimateHours(i.originalEstimateSeconds),
    isSubtask: /^sub-?task$/i.test(i.workType),
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
        title: "Avg. Sprint Velocity",
        value: `${currentVelocity} pts`,
        subtitle: isGlobalAll
          ? `Average SP per sprint across ${velocityPodCount} pods`
          : "SP completed in latest sprint",
        trend: velocityTrendPct,
        trendLabel: velocityTrendPct === 0 ? "no change vs last sprint" : "vs last sprint",
        color: "blue" as const,
        trendGood: "up" as const,
        drilldownTab: "executive",
      },
      {
        title: "Future Predictability",
        value: futureForecast.forecastableCount > 0 ? `${futureForecast.score}%` : "N/A",
        subtitle:
          futureForecast.forecastableCount > 0
            ? "Forecast on-time estimated features ÷ estimated features (future due dates)"
            : futureForecast.plannedCount > 0
            ? "No estimated remaining work on planned features"
            : "No late-stage features with future due dates",
        trend: 0,
        trendLabel: "due-date forecast",
        color:
          futureForecast.forecastableCount === 0
            ? ("blue" as const)
            : futureForecast.score >= 85
            ? ("green" as const)
            : futureForecast.score >= 50
            ? ("blue" as const)
            : ("red" as const),
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
    developers,
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
      epicsOnSchedule: futureForecast.score,
      forecastableFeatures: futureForecast.forecastableCount,
      unestimatedFeatures: futureForecast.unestimatedCount,
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
      originalEstimateHours: estimateHours(i.originalEstimateSeconds),
      reason: futureForecast.reasons.get(i.key),
    })),
    developerIssueList,
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
      "duedate",
      "timeoriginalestimate",
      config.storyPointsField,
      config.sprintField,
      config.podField,
    ]);

    const allItems = inheritParentContext(
      issues.map((issue) => mapIssueToWorkItem(issue, config))
    );

    // Apply pod/quarter scope first. Future Predictability uses this broader
    // scope because a feature can span multiple sprints.
    let filteredScope = allItems;
    if (filters.podId && filters.podId !== "all") {
      filteredScope = filteredScope.filter((i) => i.podKey === filters.podId);
    }
    if (filters.quarterId && filters.quarterId !== "all") {
      filteredScope = filteredScope.filter((i) => i.quarter === filters.quarterId);
    }

    // Sprint filter applies to delivery metrics and Developer View.
    let filteredAll = filteredScope;
    if (filters.sprintId && filters.sprintId !== "all") {
      filteredAll = filteredAll.filter((i) => i.sprints.includes(filters.sprintId));
    }

    const filtered = filteredAll.filter((item) => !/^sub-?task$/i.test(item.workType));
    const forecastScope = filteredScope.filter(
      (item) => !/^sub-?task$/i.test(item.workType)
    );
    const forecastChildScope = allItems.filter(
      (item) =>
        !/^sub-?task$/i.test(item.workType) &&
        (!filters.podId || filters.podId === "all" || item.podKey === filters.podId)
    );
    const kpis = calculateKPIs(
      filtered,
      filters,
      filteredAll,
      forecastScope,
      forecastChildScope
    );

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
      developerIssueList: kpis.developerIssueList,
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

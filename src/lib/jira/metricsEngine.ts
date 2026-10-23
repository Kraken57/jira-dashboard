import {
  ContributorSlippage,
  DashboardData,
  DashboardFilters,
  DeliveryChartData,
  DeveloperStat,
  DiagnosisData,
  FilterSummary,
  IssueRow,
  JiraWorkItem,
  MetricCardData,
  PodOption,
  PredictabilityData,
  QualityData,
  QuarterOption,
  SprintAnalysisData,
  SprintMeta,
  SprintOption,
  TrendsData,
  UnfinishedIssue,
  VelocityChartData,
} from "./types";

/**
 * Statuses that count as "delivered". Jira workflow status names differ per
 * site, so they are administrator-configurable via JIRA_DONE_STATUSES.
 * Format: comma-separated list, e.g. "Done,Accepted,Released,Closed".
 */
export const DONE_STATUSES = new Set(
  (process.env.JIRA_DONE_STATUSES || "Done,Accepted,Released,Closed,Resolved")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

/**
 * Derive sprint names from the actual data so the dashboard works with any
 * Jira project/board without code changes.
 */
function sprintDisplayName(name: string): string {
  // "2026-Q3 Iteration 1"             -> "Iteration 1"
  // "DTR 2026 - Q4 - Iteration 2"     -> "Iteration 2"
  // "CY26 PI.3 Sprint 1"              -> "Sprint 1"
  const stripped = name
    .replace(/^(?:[A-Za-z0-9]+\s+)?\d{4}\s*-\s*Q\d+\s*(?:-\s*)?/i, "")
    .replace(/^(?:[A-Za-z0-9]+\s+)?\d{4}\s*-\s*Q\d+\s+/i, "")
    .replace(/^(?:CY)?\d{2}\s+PI\.?\d+\s*(?:-\s*)?/i, "")
    .trim();
  return stripped || name;
}

/**
 * How many recent sprints to plot. Keeps the charts readable instead of
 * plotting every historical sprint.
 */
const SPRINT_WINDOW = Math.max(1, Number(process.env.JIRA_SPRINT_WINDOW || 5));

/**
 * A future (zero-work or planned) sprint is only surfaced when the active
 * sprint is this close to ending.
 */
const NEXT_SPRINT_REVEAL_DAYS = Number(
  process.env.JIRA_NEXT_SPRINT_REVEAL_DAYS || 5
);

function sprintOrderKey(name: string, meta?: SprintMeta): number {
  const year = Number(name.match(/(\d{4})/)?.[1] || 0);
  const q = Number(name.match(/Q\s*(\d)/i)?.[1] || 0);
  const pi = Number(name.match(/PI\.?\s*(\d)/i)?.[1] || 0);
  const iter = Number(name.match(/(?:iteration|sprint)\s*(\d+)/i)?.[1] || 0);
  if (year > 0) return year * 1e6 + (q || pi) * 1e4 + iter;
  if (meta?.startDate) {
    const started = Date.parse(meta.startDate);
    if (!Number.isNaN(started)) return started;
  }
  return iter;
}

function daysUntil(iso?: string): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (t - Date.now()) / 86400000;
}

function pctChange(current: number, previous: number): number {
  if (previous > 0) return Math.round(((current - previous) / previous) * 100);
  return current > 0 ? 100 : 0;
}

function derivePods(items: JiraWorkItem[]): PodOption[] {
  const map = new Map<string, { name: string; count: number }>();
  for (const item of items) {
    const key = item.podKey || "UNKNOWN";
    if (!map.has(key)) {
      map.set(key, { name: item.podName || key, count: 0 });
    }
    map.get(key)!.count++;
  }

  const pods: PodOption[] = [
    { id: "all", key: "ALL", name: "All Pods", sub: `${map.size} pods` },
  ];
  for (const [key, val] of Array.from(map.entries()).sort()) {
    pods.push({ id: key, key, name: val.name, sub: `${val.count} issues` });
  }
  return pods;
}

function deriveQuarters(items: JiraWorkItem[]): QuarterOption[] {
  const set = new Set<string>();
  for (const item of items) {
    if (item.quarter && item.quarter !== "All") set.add(item.quarter);
  }
  const quarters: QuarterOption[] = [
    { id: "all", name: "All Quarters", sub: "Full Portfolio" },
  ];
  for (const q of Array.from(set).sort()) {
    quarters.push({ id: q, name: q });
  }
  return quarters;
}

function matchesSprint(itemSprints: string[] | undefined | null, target: string): boolean {
  if (target === "all") return true;
  if (!Array.isArray(itemSprints) || itemSprints.length === 0) return false;
  const t = target.trim().toLowerCase();
  return itemSprints.some((s) => {
    if (!s || typeof s !== "string") return false;
    const itemS = s.trim().toLowerCase();
    return itemS === t || itemS.includes(t) || t.includes(itemS);
  });
}

export function computeDashboardData(
  items: JiraWorkItem[],
  filters: DashboardFilters,
  sprintMeta: Record<string, SprintMeta> = {}
): DashboardData {
  const { podId, quarterId, sprintId } = filters;

  // 1. Scoped items by Pod & Quarter
  const scopedItems = items.filter((item) => {
    if (podId !== "all" && item.podKey !== podId) return false;
    if (quarterId !== "all" && item.quarter !== quarterId) return false;
    return true;
  });

  // 2. Active items filtered by selected sprint
  const activeItems = scopedItems.filter((item) => {
    if (sprintId !== "all" && !matchesSprint(item.sprints, sprintId)) return false;
    return true;
  });

  // 3. Compute Summary Counts
  let totalStoryPoints = 0;
  let completedStoryPoints = 0;
  let completedIssues = 0;
  let inProgressIssues = 0;

  activeItems.forEach((item) => {
    const sp = item.storyPoints || 0;
    totalStoryPoints += sp;
    const isDone = DONE_STATUSES.has(item.status);

    if (isDone) {
      completedStoryPoints += sp;
      completedIssues += 1;
    } else {
      inProgressIssues += 1;
    }
  });

  const summary: FilterSummary = {
    totalIssues: activeItems.length,
    completedIssues,
    inProgressIssues,
    totalStoryPoints: Math.round(totalStoryPoints),
    completedStoryPoints: Math.round(completedStoryPoints),
  };

  // 4. Sprint window: only sprints that actually have work in the current
  //    pod/quarter scope, ordered chronologically, limited to the latest few.
  const sprintCountMap = new Map<string, number>();
  for (const it of scopedItems) {
    for (const s of it.sprints || []) {
      const name = s.trim();
      if (!name) continue;
      sprintCountMap.set(name, (sprintCountMap.get(name) || 0) + 1);
    }
  }

  const observedSprints = Array.from(sprintCountMap.entries())
    .filter(([, count]) => count > 0)
    .map(([name]) => name)
    .sort(
      (a, b) => sprintOrderKey(a, sprintMeta[a]) - sprintOrderKey(b, sprintMeta[b])
    );

  // "Upcoming" is judged by start date: Jira sometimes reports already-started
  // historical sprints as state=future, which must not hide real work.
  const now = Date.now();
  const sprintStatus = (name: string): "Active" | "Closed" | "Upcoming" | "" => {
    const meta = sprintMeta[name];
    if (meta?.state === "active") return "Active";
    const start = meta?.startDate ? Date.parse(meta.startDate) : NaN;
    const end = meta?.endDate ? Date.parse(meta.endDate) : NaN;
    if (!Number.isNaN(start) && !Number.isNaN(end)) {
      if (start > now) return "Upcoming";
      if (end < now) return "Closed";
      return "Active";
    }
    if (meta?.state === "future") return "Upcoming";
    if (meta?.state === "closed") return "Closed";
    return "";
  };
  const isUpcoming = (name: string) => sprintStatus(name) === "Upcoming";

  // Only reveal the nearest upcoming sprint when the active one is nearly over.
  const activeEndDays = observedSprints
    .filter((name) => sprintStatus(name) === "Active")
    .map((name) => daysUntil(sprintMeta[name]?.endDate))
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b)[0];

  let revealedFuture: string | null = null;
  if (activeEndDays !== undefined && activeEndDays <= NEXT_SPRINT_REVEAL_DAYS) {
    const upcoming = observedSprints
      .filter(isUpcoming)
      .sort(
        (a, b) => sprintOrderKey(a, sprintMeta[a]) - sprintOrderKey(b, sprintMeta[b])
      );
    revealedFuture = upcoming[0] || null;
  }

  const windowNames = observedSprints
    .filter((name) => !isUpcoming(name) || name === revealedFuture)
    .slice(-SPRINT_WINDOW);

  const sprintStats = windowNames.map((sprintName) => {
    const sprintItems = scopedItems.filter((it) =>
      matchesSprint(it.sprints, sprintName)
    );
    let committedSP = 0;
    let doneSP = 0;
    let carriedSP = 0;
    let issueCount = 0;
    let doneCount = 0;

    sprintItems.forEach((it) => {
      const sp = it.storyPoints || 0;
      committedSP += sp;
      issueCount += 1;
      if (DONE_STATUSES.has(it.status)) {
        doneSP += sp;
        doneCount += 1;
      } else {
        carriedSP += sp;
      }
    });

    return {
      name: sprintDisplayName(sprintName),
      fullName: sprintName,
      planned: Math.round(committedSP),
      committed: Math.round(committedSP),
      done: Math.round(doneSP),
      carried: Math.round(carriedSP),
      issueCount,
      doneCount,
    };
  });

  // 5. Delivery and Velocity Datasets
  const delivery: DeliveryChartData = {
    labels: sprintStats.map((s) => s.name),
    planned: sprintStats.map((s) => s.committed),
    committed: sprintStats.map((s) => s.committed),
    done: sprintStats.map((s) => s.done),
    carried: sprintStats.map((s) => s.carried),
  };

  const completedSeries = sprintStats.map((s) => s.done);
  const committedSeries = sprintStats.map((s) => s.committed);
  const totalFinished = completedSeries.reduce((a, b) => a + b, 0);
  const lastThree = completedSeries.slice(Math.max(completedSeries.length - 3, 0));
  const avgLastThree = lastThree.length
    ? Number((lastThree.reduce((a, b) => a + b, 0) / lastThree.length).toFixed(1))
    : 0;

  const lastIndex = completedSeries.length - 1;
  const trendDiff =
    lastIndex >= 1 ? completedSeries[lastIndex] - completedSeries[lastIndex - 1] : 0;
  const trendStatus: "rising" | "falling" | "stable" =
    trendDiff > 0 ? "rising" : trendDiff < 0 ? "falling" : "stable";

  const velocity: VelocityChartData = {
    labels: sprintStats.map((s) => s.name),
    completed: completedSeries,
    committed: committedSeries,
    totalFinished,
    avgLastThree,
    trendStatus,
  };

  // 6. Executive KPI Metrics — all derived from the actual items/sprints.
  const totalCommitted = summary.totalStoryPoints;
  const totalDone = summary.completedStoryPoints;
  const sayDoRatio =
    totalCommitted > 0 ? Math.round((totalDone / totalCommitted) * 100) : 0;
  const carryOver =
    totalCommitted > 0
      ? Math.round(((totalCommitted - totalDone) / totalCommitted) * 100)
      : 0;

  const lastSprint = sprintStats[sprintStats.length - 1];
  const prevSprint = sprintStats[sprintStats.length - 2];
  const sprintSayDo = (s: typeof lastSprint | undefined) =>
    s && s.committed > 0 ? (s.done / s.committed) * 100 : 0;
  const sprintCarry = (s: typeof lastSprint | undefined) =>
    s && s.committed > 0 ? (s.carried / s.committed) * 100 : 0;

  const sayDoTrend =
    lastSprint && prevSprint
      ? Math.round(sprintSayDo(lastSprint) - sprintSayDo(prevSprint))
      : 0;
  const carryTrend =
    lastSprint && prevSprint
      ? Math.round(sprintCarry(lastSprint) - sprintCarry(prevSprint))
      : 0;
  const velocityTrendPct =
    lastSprint && prevSprint ? pctChange(lastSprint.done, prevSprint.done) : 0;

  const currentVelocity =
    sprintId !== "all"
      ? summary.completedStoryPoints
      : Math.round(avgLastThree);

  const hittingSprints = sprintStats.filter(
    (s) => s.committed > 0 && s.done / s.committed >= 0.9
  ).length;
  const predictabilityScore = sprintStats.length
    ? Math.round((hittingSprints / sprintStats.length) * 100)
    : 0;
  const predictabilityTrend =
    lastSprint && prevSprint
      ? Math.round(sprintSayDo(lastSprint) - sprintSayDo(prevSprint))
      : 0;

  const trendLabelFor = (delta: number) =>
    delta === 0 ? "no change vs last sprint" : "vs last sprint";

  const metrics: MetricCardData[] = [
    {
      title: "Say/Do Ratio",
      value: `${sayDoRatio}%`,
      subtitle: "Completed SP vs committed SP",
      trend: sayDoTrend,
      trendLabel: trendLabelFor(sayDoTrend),
      color: sayDoRatio >= 80 ? "green" : sayDoRatio >= 65 ? "blue" : "red",
      trendGood: "up",
      drilldownTab: "diagnosis",
    },
    {
      title: "Sprint Carry Over",
      value: `${carryOver}%`,
      subtitle: "Unfinished SP carried to next sprint",
      trend: carryTrend,
      trendLabel: trendLabelFor(carryTrend),
      color: carryOver <= 18 ? "green" : carryOver <= 28 ? "blue" : "red",
      trendGood: "down",
      drilldownTab: "diagnosis",
    },
    {
      title: "Team/Epic Velocity",
      value: `${currentVelocity} pts`,
      subtitle: "Avg done SP over last 3 sprints",
      trend: velocityTrendPct,
      trendLabel: trendLabelFor(velocityTrendPct),
      color: "blue",
      trendGood: "up",
      drilldownTab: "trends",
    },
    {
      title: "Feature Predictability",
      value: `${predictabilityScore}%`,
      subtitle: "Sprints hitting 90% of commitment",
      trend: predictabilityTrend,
      trendLabel: trendLabelFor(predictabilityTrend),
      color: predictabilityScore >= 85 ? "green" : "blue",
      trendGood: "up",
      drilldownTab: "predictability",
    },
  ];

  // 7. Developer Breakdown
  const devMap = new Map<string, { assigned: number; done: number; deliveredSP: number; totalSP: number; team: string }>();
  activeItems.forEach((it) => {
    const devName = it.assignee || "Unassigned";
    const existing = devMap.get(devName) || { assigned: 0, done: 0, deliveredSP: 0, totalSP: 0, team: it.team || it.podName };
    existing.assigned += 1;
    existing.totalSP += it.storyPoints || 0;
    if (DONE_STATUSES.has(it.status)) {
      existing.done += 1;
      existing.deliveredSP += it.storyPoints || 0;
    }
    devMap.set(devName, existing);
  });

  const developers: DeveloperStat[] = Array.from(devMap.entries())
    .map(([name, stat]) => ({
      name,
      team: stat.team,
      assignedIssues: stat.assigned,
      completedIssues: stat.done,
      deliveredSP: Math.round(stat.deliveredSP),
      totalSP: Math.round(stat.totalSP),
      completionRate: stat.totalSP > 0 ? Math.round((stat.deliveredSP / stat.totalSP) * 100) : 0,
    }))
    .sort((a, b) => b.deliveredSP - a.deliveredSP);

  // 8. Sprint Analysis Details
  const typeMap = new Map<string, { count: number; sp: number }>();
  const statusMap = new Map<string, number>();

  activeItems.forEach((it) => {
    const t = it.workType || "Story";
    const tStat = typeMap.get(t) || { count: 0, sp: 0 };
    tStat.count += 1;
    tStat.sp += it.storyPoints || 0;
    typeMap.set(t, tStat);

    statusMap.set(it.status, (statusMap.get(it.status) || 0) + 1);
  });

  // Average time from creation to resolution for completed items (real data).
  const resolvedDurations: number[] = [];
  activeItems.forEach((it) => {
    if (!DONE_STATUSES.has(it.status)) return;
    if (!it.createdDate || !it.resolutionDate) return;
    const created = Date.parse(it.createdDate);
    const resolved = Date.parse(it.resolutionDate);
    if (!Number.isNaN(created) && !Number.isNaN(resolved) && resolved >= created) {
      resolvedDurations.push((resolved - created) / 86400000);
    }
  });
  const avgResolutionDays = resolvedDurations.length
    ? Number(
        (
          resolvedDurations.reduce((a, b) => a + b, 0) /
          resolvedDurations.length
        ).toFixed(1)
      )
    : 0;

  // Planned vs unplanned: work created after the active sprint started counts
  // as unplanned. Falls back to all-planned when no sprint dates are known.
  const activeSprintName = windowNames.find(
    (name) => sprintMeta[name]?.state === "active"
  );
  const activeStart = activeSprintName
    ? Date.parse(sprintMeta[activeSprintName]?.startDate || "")
    : NaN;
  let plannedCount = 0;
  let unplannedCount = 0;
  if (!Number.isNaN(activeStart)) {
    activeItems.forEach((it) => {
      const created = Date.parse(it.createdDate || "");
      if (!Number.isNaN(created) && created > activeStart) unplannedCount += 1;
      else plannedCount += 1;
    });
  } else {
    plannedCount = activeItems.length;
  }
  const plannedWorkPct =
    plannedCount + unplannedCount > 0
      ? Math.round((plannedCount / (plannedCount + unplannedCount)) * 100)
      : 0;

  const sprintAnalysis: SprintAnalysisData = {
    // Scope churn needs the changelog; we only report what we can derive.
    scopeChurnPct: 0,
    plannedWorkPct,
    unplannedWorkPct: plannedWorkPct > 0 ? 100 - plannedWorkPct : 0,
    avgCycleTimeDays: avgResolutionDays,
    avgLeadTimeDays: avgResolutionDays,
    workTypeBreakdown: Array.from(typeMap.entries()).map(([type, stat]) => ({
      type,
      count: stat.count,
      storyPoints: Math.round(stat.sp),
    })),
    statusBreakdown: Array.from(statusMap.entries()).map(([status, count]) => {
      let color = "#585f6b";
      if (DONE_STATUSES.has(status)) color = "#0e7c3e";
      else if (/progress|development|review/i.test(status)) color = "#0052cc";
      else if (/test/i.test(status)) color = "#f2a900";
      return { status, count, color };
    }),
  };

  // 9. Quality Metrics — real bugs only (issue type Bug).
  const bugs = activeItems.filter((it) => it.workType === "Bug");
  const resolvedBugs = bugs.filter((it) => DONE_STATUSES.has(it.status));
  const priorityCountMap = new Map<string, number>();
  activeItems.forEach((it) => {
    const p = it.priority || "Medium";
    priorityCountMap.set(p, (priorityCountMap.get(p) || 0) + 1);
  });

  const quality: QualityData = {
    defectDensity:
      summary.totalStoryPoints > 0
        ? Number(((bugs.length / summary.totalStoryPoints) * 100).toFixed(1))
        : 0,
    totalBugs: bugs.length,
    resolvedBugs: resolvedBugs.length,
    resolutionRate:
      bugs.length > 0
        ? Math.round((resolvedBugs.length / bugs.length) * 100)
        : 0,
    avgResolutionDays,
    priorityDistribution: Array.from(priorityCountMap.entries()).map(([priority, count]) => {
      let color = "#585f6b";
      if (priority === "Highest" || priority === "High") color = "#c03a2b";
      else if (priority === "Medium") color = "#f2a900";
      else color = "#0052cc";
      return { priority, count, color };
    }),
  };

  // 10. Predictability Details
  const predictability: PredictabilityData = {
    score: predictabilityScore,
    varianceSP: Math.abs(summary.totalStoryPoints - summary.completedStoryPoints),
    epicsOnSchedule: predictabilityScore,
    history: sprintStats.map((s) => ({
      sprint: s.name,
      planned: s.planned,
      delivered: s.done,
      sayDo: s.committed > 0 ? Math.min(Math.round((s.done / s.committed) * 100), 100) : 0,
    })),
  };

  // 11. Trends Details — cumulative counts are running sums of real sprint data.
  let cumulativeIssues = 0;
  let cumulativeDoneIssues = 0;
  const totalIssuesSeries = sprintStats.map((s) => {
    cumulativeIssues += s.issueCount;
    return cumulativeIssues;
  });
  const completedIssuesSeries = sprintStats.map((s) => {
    cumulativeDoneIssues += s.doneCount;
    return cumulativeDoneIssues;
  });

  const trends: TrendsData = {
    velocityTrend: {
      labels: sprintStats.map((s) => s.name),
      velocity: completedSeries,
      movingAvg: sprintStats.map((_, idx) => {
        const slice = completedSeries.slice(0, idx + 1);
        return Math.round(slice.reduce((a, b) => a + b, 0) / slice.length);
      }),
    },
    cumulativeThroughput: {
      labels: sprintStats.map((s) => s.name),
      totalIssues: totalIssuesSeries,
      completedIssues: completedIssuesSeries,
    },
  };

  // 12. Delivery Diagnosis & Root Cause Analysis
  const unfinishedItems = activeItems.filter((it) => !DONE_STATUSES.has(it.status));

  const getReason = (it: JiraWorkItem) => {
    if (it.workType === "Bug") {
      return "Defect / Unresolved Bug";
    }
    if ((it.storyPoints || 0) >= 8) {
      return "High Complexity Scope (8+ SP)";
    }
    if (/review|qa|test/i.test(it.status)) {
      return "Review / QA Pipeline Delay";
    }
    if (/progress|development/i.test(it.status)) {
      return "In-Progress Bottleneck";
    }
    if (/todo|to do|backlog|ready|selected|pending/i.test(it.status)) {
      return "Delayed Start / Backlog Delay";
    }
    return "Carried-Over Scope";
  };

  const contributorSlippageMap = new Map<
    string,
    { team: string; incompleteSP: number; completedSP: number; count: number; reasons: Map<string, number> }
  >();

  activeItems.forEach((it) => {
    const dev = it.assignee || "Unassigned";
    const existing = contributorSlippageMap.get(dev) || {
      team: it.team || it.podName,
      incompleteSP: 0,
      completedSP: 0,
      count: 0,
      reasons: new Map<string, number>(),
    };
    const sp = it.storyPoints || 0;
    if (DONE_STATUSES.has(it.status)) {
      existing.completedSP += sp;
    } else {
      existing.incompleteSP += sp;
      existing.count += 1;
      const r = getReason(it);
      existing.reasons.set(r, (existing.reasons.get(r) || 0) + 1);
    }
    contributorSlippageMap.set(dev, existing);
  });

  const contributors: ContributorSlippage[] = Array.from(contributorSlippageMap.entries())
    .filter(([_, stat]) => stat.incompleteSP > 0)
    .map(([name, stat]) => {
      let topReason = "In-Progress Delay";
      let topCount = 0;
      stat.reasons.forEach((cnt, r) => {
        if (cnt > topCount) {
          topCount = cnt;
          topReason = r;
        }
      });
      return {
        name,
        team: stat.team,
        incompleteSP: Math.round(stat.incompleteSP),
        completedSP: Math.round(stat.completedSP),
        totalAssignedSP: Math.round(stat.incompleteSP + stat.completedSP),
        incompleteIssuesCount: stat.count,
        primaryReason: topReason,
      };
    })
    .sort((a, b) => b.incompleteSP - a.incompleteSP);

  const unfinishedIssues: UnfinishedIssue[] = unfinishedItems
    .slice(0, 150)
    .map((it) => ({
      key: it.key,
      summary: it.summary,
      workType: it.workType,
      status: it.status,
      storyPoints: it.storyPoints || 0,
      podKey: it.podKey,
      podName: it.podName,
      sprint: it.sprints.length > 0 ? it.sprints.join(", ") : "Backlog",
      assignee: it.assignee || "Unassigned",
      priority: it.priority || "Medium",
      reason: getReason(it),
    }))
    .sort((a, b) => b.storyPoints - a.storyPoints);

  const slippageSP = Math.max(summary.totalStoryPoints - summary.completedStoryPoints, 0);
  const slippagePct =
    summary.totalStoryPoints > 0 ? Math.round((slippageSP / summary.totalStoryPoints) * 100) : carryOver;

  const reasonFreq = new Map<string, number>();
  unfinishedItems.forEach((it) => {
    const r = getReason(it);
    reasonFreq.set(r, (reasonFreq.get(r) || 0) + 1);
  });
  let primaryDriver = unfinishedItems.length > 0 ? "In-Progress Execution Bottleneck" : "No slippage detected";
  let maxDriverCount = 0;
  reasonFreq.forEach((cnt, r) => {
    if (cnt > maxDriverCount) {
      maxDriverCount = cnt;
      primaryDriver = r;
    }
  });

  const diagnosis: DiagnosisData = {
    slippageSP,
    slippagePct,
    primaryDriver,
    atRiskContributorsCount: contributors.length,
    contributors,
    unfinishedIssues,
  };

  // 13. Issue Explorer List
  const issueList: IssueRow[] = activeItems.slice(0, 150).map((it) => ({
    key: it.key,
    summary: it.summary,
    workType: it.workType,
    status: it.status,
    storyPoints: it.storyPoints || 0,
    podKey: it.podKey,
    podName: it.podName,
    sprint: it.sprints.length > 0 ? it.sprints.join(", ") : "Backlog",
    assignee: it.assignee || "Unassigned",
    priority: it.priority || "Medium",
    createdDate: it.createdDate || "",
    isDone: DONE_STATUSES.has(it.status),
  }));

  // Sprints filter list — only sprints that have work and are inside the plot window.
  const sprints: SprintOption[] = [
    { id: "all", name: "All Sprints", sub: `Latest ${windowNames.length} sprints` },
    ...windowNames.map((name, i) => ({
      id: name,
      name: sprintDisplayName(name),
      sub: `Sprint ${i + 1}`,
    })),
  ];

  return {
    pods: derivePods(items),
    quarters: deriveQuarters(items),
    sprints,
    metrics,
    velocity,
    delivery,
    summary,
    developers,
    sprintAnalysis,
    quality,
    predictability,
    trends,
    diagnosis,
    issueList,
  };
}

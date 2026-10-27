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
  MetricInsight,
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

const DAY_MS = 86_400_000;
const RATE_WINDOW_DAYS = 30;

/**
 * Future Predictability — share of planned features (not done, due date in the
 * future) forecast to finish on or before their due date at the team's recent
 * delivery rate. Forward-looking and due-date based; different from Say/Do,
 * which compares delivered vs committed points after the fact.
 *
 * A feature is forecast on time when its estimated remaining work (story
 * points) fits inside the days remaining until its due date at the team's
 * average delivery rate over the last 30 days.
 */
export function computeFuturePredictability(
  items: JiraWorkItem[],
  isDone: (status: string) => boolean
) {
  const now = Date.now();
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const rateStart = now - RATE_WINDOW_DAYS * DAY_MS;
  const recentDoneSP = items
    .filter(
      (it) =>
        isDone(it.status) &&
        it.resolutionDate &&
        new Date(it.resolutionDate).getTime() >= rateStart
    )
    .reduce((sum, it) => sum + (it.storyPoints || 0), 0);
  // ponytail: flat SP/day rate over 30 days; per-pod rates if the single rate mispredicts.
  const dailyRate = recentDoneSP / RATE_WINDOW_DAYS;

  // Sites without a "Feature" issue type report feature-level work as Epics.
  const hasFeatureType = items.some((it) => /^feature$/i.test(it.workType));
  const isFeature = (it: JiraWorkItem) =>
    hasFeatureType ? /^feature$/i.test(it.workType) : /^epic$/i.test(it.workType);

  const isFutureDated = (it: JiraWorkItem) =>
    Boolean(it.dueDate) && new Date(it.dueDate as string).getTime() >= startOfToday;

  const planned = items.filter(
    (it) => isFeature(it) && !isDone(it.status) && isFutureDated(it)
  );
  const pastDue = items.filter(
    (it) => isFeature(it) && !isDone(it.status) && !isFutureDated(it) && !!it.dueDate
  );

  const onTimeCount = planned.filter((it) => {
    const remaining = it.storyPoints || 0;
    if (dailyRate <= 0) return remaining === 0;
    const days = Math.ceil(
      (new Date(it.dueDate as string).getTime() - startOfToday) / DAY_MS
    );
    return remaining <= dailyRate * days;
  }).length;

  const reasons = new Map<string, string>();
  planned.forEach((it) => {
    const remaining = it.storyPoints || 0;
    if (dailyRate <= 0) {
      reasons.set(
        it.key,
        remaining === 0
          ? "On Forecast"
          : "At Risk (no recent delivery rate)"
      );
      return;
    }
    const days = Math.ceil(
      (new Date(it.dueDate as string).getTime() - startOfToday) / DAY_MS
    );
    const capacity = Math.round(dailyRate * days * 10) / 10;
    reasons.set(
      it.key,
      remaining <= dailyRate * days
        ? `On Forecast (${remaining} SP ≤ ${capacity} SP capacity by due date)`
        : `At Risk (${remaining} SP > ${capacity} SP capacity by due date)`
    );
  });
  pastDue.forEach((it) => reasons.set(it.key, "Past Due (missed due date)"));

  return {
    dailyRate: Math.round(dailyRate * 10) / 10,
    plannedCount: planned.length,
    onTimeCount,
    pastDueCount: pastDue.length,
    score: planned.length > 0 ? Math.round((onTimeCount / planned.length) * 100) : 0,
    plannedKeys: new Set(planned.map((it) => it.key)),
    reasons,
  };
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

function quarterSortKey(q: string): number {
  const m = q.match(/CY(\d{2})\s*PI\.?\s*(\d+)/i);
  return m ? Number(m[1]) * 100 + Number(m[2]) : 9999;
}

function deriveQuarters(items: JiraWorkItem[]): QuarterOption[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.quarter && item.quarter !== "All") {
      counts.set(item.quarter, (counts.get(item.quarter) || 0) + 1);
    }
  }
  const quarters: QuarterOption[] = [
    { id: "all", name: "All Quarters", sub: "Full portfolio" },
  ];
  for (const q of Array.from(counts.keys()).sort(
    (a, b) => quarterSortKey(a) - quarterSortKey(b)
  )) {
    quarters.push({ id: q, name: q, sub: `${counts.get(q)} issues` });
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

  // Subtasks are execution breakdowns of a parent item; counting them would
  // double-count story points and clutter the issue lists. They are excluded
  // from every metric, popup, and type filter.
  const workItems = items.filter((item) => !/^sub-?task$/i.test(item.workType));

  // 1. Scoped items by Pod & Quarter
  const scopedItems = workItems.filter((item) => {
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
  for (const it of activeItems) {
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

  const windowNames =
    sprintId !== "all"
      ? [sprintId]
      : observedSprints
          .filter((name) => !isUpcoming(name) || name === revealedFuture)
          .slice(-SPRINT_WINDOW);

  const buildSprintStat = (sprintName: string, pool: JiraWorkItem[]) => {
    const sprintItems = pool.filter((it) => matchesSprint(it.sprints, sprintName));
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
  };

  const sprintStats = windowNames.map((sprintName) =>
    buildSprintStat(sprintName, activeItems)
  );

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

  // 6. Executive KPI Metrics — aggregate over every sprint in the current
  //    selection. For "All Sprints" use the de-duplicated scope totals so an
  //    item carried across sprints is only counted once.
  // Velocity = SP completed in the period.
  // Say-Do   = completed committed SP / committed SP.
  // Spillover= spilled-over committed SP / committed SP.
  // Predictability = completed committed SP / planned SP.
  const isAllSprints = sprintId === "all";
  const lastSprint = sprintStats[sprintStats.length - 1];

  // Trend comparison uses the latest plotted sprint vs the one before it, even
  // when the cards aggregate the whole selection. This keeps the delta useful
  // instead of always showing 0 for "All Sprints".
  const currentCompareName =
    sprintId === "all" ? lastSprint?.fullName : sprintId;
  let compareIndex = currentCompareName
    ? observedSprints.findIndex((name) => name === currentCompareName)
    : -1;
  if (compareIndex < 0 && currentCompareName) {
    compareIndex = observedSprints.findIndex((name) =>
      matchesSprint([name], currentCompareName)
    );
  }
  const compareNames =
    compareIndex >= 0
      ? observedSprints.slice(Math.max(0, compareIndex - 2), compareIndex + 1)
      : [];
  const compareStats = compareNames.map((name) =>
    buildSprintStat(name, scopedItems)
  );
  const currentCompare = compareStats[compareStats.length - 1];
  const prevCompare = compareStats[compareStats.length - 2];
  const hasComparison = Boolean(currentCompare && prevCompare);

  const scopeCommittedSP = isAllSprints
    ? summary.totalStoryPoints
    : lastSprint?.committed ?? 0;
  const scopeDoneSP = isAllSprints
    ? summary.completedStoryPoints
    : lastSprint?.done ?? 0;
  const scopeCarriedSP = isAllSprints
    ? Math.max(summary.totalStoryPoints - summary.completedStoryPoints, 0)
    : lastSprint?.carried ?? 0;

  const sayDoRatio = scopeCommittedSP > 0
    ? Math.round((scopeDoneSP / scopeCommittedSP) * 100)
    : 0;
  const carryOver = scopeCommittedSP > 0
    ? Math.round((scopeCarriedSP / scopeCommittedSP) * 100)
    : 0;
  const currentVelocity = scopeDoneSP;

  const sayDoOf = (s: typeof currentCompare | undefined) =>
    s && s.committed > 0 ? (s.done / s.committed) * 100 : 0;
  const carryOf = (s: typeof currentCompare | undefined) =>
    s && s.committed > 0 ? (s.carried / s.committed) * 100 : 0;

  const sayDoTrend =
    hasComparison && currentCompare && prevCompare
      ? Math.round(sayDoOf(currentCompare) - sayDoOf(prevCompare))
      : 0;
  const carryTrend =
    hasComparison && currentCompare && prevCompare
      ? Math.round(carryOf(currentCompare) - carryOf(prevCompare))
      : 0;
  const velocityTrendPct =
    hasComparison && currentCompare && prevCompare
      ? pctChange(currentCompare.done, prevCompare.done)
      : 0;

  const predictabilityScore =
    scopeCommittedSP > 0 ? Math.round((scopeDoneSP / scopeCommittedSP) * 100) : 0; // (kept for the Predictability tab)
  const futurePredictability = computeFuturePredictability(scopedItems, (s) =>
    DONE_STATUSES.has(s)
  );

  const trendLabelFor = (delta: number) =>
    !prevCompare || !currentCompare
      ? "no previous sprint"
      : delta === 0
      ? `no change vs ${prevCompare.name}`
      : `${currentCompare.name} vs ${prevCompare.name}`;

  const metrics: MetricCardData[] = [
    {
      title: "Say/Do Ratio",
      value: `${sayDoRatio}%`,
      subtitle: "Completed committed SP ÷ committed SP",
      trend: sayDoTrend,
      trendLabel: trendLabelFor(sayDoTrend),
      trendUnit: "pp",
      color: sayDoRatio >= 80 ? "green" : sayDoRatio >= 65 ? "blue" : "red",
      trendGood: "up",
      drilldownTab: "diagnosis",
    },
    {
      title: "Sprint Carry Over",
      value: `${carryOver}%`,
      subtitle: "Spilled-over committed SP ÷ committed SP",
      trend: carryTrend,
      trendLabel: trendLabelFor(carryTrend),
      trendUnit: "pp",
      color: carryOver <= 18 ? "green" : carryOver <= 28 ? "blue" : "red",
      trendGood: "down",
      drilldownTab: "diagnosis",
    },
    {
      title: "Team/Epic Velocity",
      value: `${currentVelocity} pts`,
      subtitle:
        sprintId === "all"
          ? `SP completed across ${windowNames.length} sprints`
          : "SP completed in selected sprint",
      trend: velocityTrendPct,
      trendLabel: trendLabelFor(velocityTrendPct),
      trendUnit: "%",
      color: "blue",
      trendGood: "up",
      drilldownTab: "trends",
    },
    {
      title: "Future Predictability",
      value: `${futurePredictability.score}%`,
      subtitle:
        futurePredictability.plannedCount > 0
          ? "Forecast on-time features ÷ planned features (future due dates)"
          : "No late-stage features with future due dates",
      trend: 0,
      trendLabel: "due-date forecast",
      trendUnit: "pp",
      color:
        futurePredictability.score >= 85
          ? "green"
          : futurePredictability.score >= 50
          ? "blue"
          : "red",
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
  const avgLeadTimeDays = resolvedDurations.length
    ? Number(
        (
          resolvedDurations.reduce((a, b) => a + b, 0) /
          resolvedDurations.length
        ).toFixed(1)
      )
    : 0;

  // Planned vs unplanned: SP of work created after the active sprint started
  // counts as unplanned. Falls back to all-planned when no sprint dates known.
  const activeSprintName = windowNames.find(
    (name) => sprintMeta[name]?.state === "active"
  );
  const activeStart = activeSprintName
    ? Date.parse(sprintMeta[activeSprintName]?.startDate || "")
    : NaN;
  let plannedSP = 0;
  let unplannedSP = 0;
  if (!Number.isNaN(activeStart)) {
    activeItems.forEach((it) => {
      const created = Date.parse(it.createdDate || "");
      const sp = it.storyPoints || 0;
      if (!Number.isNaN(created) && created > activeStart) unplannedSP += sp;
      else plannedSP += sp;
    });
  } else {
    plannedSP = activeItems.reduce((a, it) => a + (it.storyPoints || 0), 0);
  }
  const plannedWorkPct =
    plannedSP + unplannedSP > 0
      ? Math.round((plannedSP / (plannedSP + unplannedSP)) * 100)
      : 0;

  const sprintAnalysis: SprintAnalysisData = {
    // Scope churn needs the changelog; we only report what we can derive.
    scopeChurnPct: 0,
    plannedWorkPct,
    unplannedWorkPct: plannedWorkPct > 0 ? 100 - plannedWorkPct : 0,
    // Cycle time needs In-Progress→Done transition history, unavailable here.
    avgCycleTimeDays: 0,
    avgLeadTimeDays,
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
  const bugDurations: number[] = [];
  resolvedBugs.forEach((it) => {
    if (!it.createdDate || !it.resolutionDate) return;
    const created = Date.parse(it.createdDate);
    const resolved = Date.parse(it.resolutionDate);
    if (!Number.isNaN(created) && !Number.isNaN(resolved) && resolved >= created) {
      bugDurations.push((resolved - created) / 86400000);
    }
  });
  const avgDefectResolutionDays = bugDurations.length
    ? Number(
        (bugDurations.reduce((a, b) => a + b, 0) / bugDurations.length).toFixed(1)
      )
    : 0;
  const priorityCountMap = new Map<string, number>();
  activeItems.forEach((it) => {
    const p = it.priority || "Medium";
    priorityCountMap.set(p, (priorityCountMap.get(p) || 0) + 1);
  });

  const quality: QualityData = {
    // Confirmed defects per 100 delivered story points.
    defectDensity:
      summary.completedStoryPoints > 0
        ? Number(((bugs.length / summary.completedStoryPoints) * 100).toFixed(1))
        : 0,
    totalBugs: bugs.length,
    resolvedBugs: resolvedBugs.length,
    resolutionRate:
      bugs.length > 0
        ? Math.round((resolvedBugs.length / bugs.length) * 100)
        : 0,
    avgResolutionDays: avgDefectResolutionDays,
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
    varianceSP: Math.abs(scopeCommittedSP - scopeDoneSP),
    epicsOnSchedule: predictabilityScore,
    history: sprintStats.map((s) => ({
      sprint: s.name,
      planned: s.planned,
      delivered: s.done,
      sayDo: s.committed > 0 ? Math.round((s.done / s.committed) * 100) : 0,
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
    .filter(([, stat]) => stat.incompleteSP > 0)
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

  // 12b. Plain-language explanations for the executive KPI popups.
  const fmt = (n: number) => n.toLocaleString("en-US");
  const sayDoPercent = (s: typeof currentCompare) =>
    s && s.committed > 0 ? Math.round((s.done / s.committed) * 100) : 0;
  const carryPercent = (s: typeof currentCompare) =>
    s && s.committed > 0 ? Math.round((s.carried / s.committed) * 100) : 0;
  const trendBase = hasComparison && currentCompare && prevCompare
    ? {
        currentLabel: currentCompare.name,
        previousLabel: prevCompare.name,
      }
    : null;

  const peakSprint = sprintStats.reduce(
    (best, s) => (s.done > best.done ? s : best),
    sprintStats[0]
  );

  const metricInsights: Record<string, MetricInsight> = {
    "Say/Do Ratio": {
      what:
        "Of all the story points committed in the selected scope, how much was actually completed.",
      formula: "Done SP ÷ Committed SP × 100",
      calculation: `${fmt(scopeDoneSP)} SP done ÷ ${fmt(scopeCommittedSP)} SP committed = ${sayDoRatio}%`,
      howToCompare:
        "Compare against the 80% healthy target, the previous sprint, and other pods. A drop usually means scope was added late or work stalled mid-sprint.",
      target: {
        label: "Healthy",
        value: 80,
        current: sayDoRatio,
        unit: "%",
        direction: "atLeast",
      },
      trend:
        trendBase && currentCompare && prevCompare
          ? {
              ...trendBase,
              current: sayDoPercent(currentCompare),
              previous: sayDoPercent(prevCompare),
              delta: sayDoTrend,
              unit: "pp",
              better: "up",
            }
          : undefined,
      recent: compareStats.map((s) => ({
        label: s.name,
        value: `${sayDoPercent(s)}%`,
        detail: `${s.done} of ${s.committed} SP`,
      })),
      takeaways: [
        `${summary.totalIssues - summary.completedIssues} of ${summary.totalIssues} work items are still open.`,
        sayDoRatio >= 80
          ? `Above the 80% target by ${sayDoRatio - 80} pp.`
          : `${80 - sayDoRatio} pp below the 80% target.`,
      ],
    },
    "Sprint Carry Over": {
      what:
        "The share of committed story points that was not completed and spills into later work.",
      formula: "Carried SP ÷ Committed SP × 100",
      calculation: `${fmt(scopeCarriedSP)} SP carried ÷ ${fmt(scopeCommittedSP)} SP committed = ${carryOver}%`,
      howToCompare:
        "Lower is better. Compare with the 18% target, the previous sprint, and the Delivery Diagnosis tab to see which reasons drive the carry-over.",
      target: {
        label: "Healthy",
        value: 18,
        current: carryOver,
        unit: "%",
        direction: "atMost",
      },
      trend:
        trendBase && currentCompare && prevCompare
          ? {
              ...trendBase,
              current: carryPercent(currentCompare),
              previous: carryPercent(prevCompare),
              delta: carryTrend,
              unit: "pp",
              better: "down",
            }
          : undefined,
      recent: compareStats.map((s) => ({
        label: s.name,
        value: `${carryPercent(s)}%`,
        detail: `${s.carried} SP carried`,
      })),
      takeaways: [
        `${fmt(scopeCarriedSP)} SP is currently carried over.`,
        `Primary driver: ${primaryDriver}.`,
        `${contributors.length} contributor${contributors.length === 1 ? "" : "s"} still hold unfinished work.`,
      ],
    },
    "Team/Epic Velocity": {
      what: "The number of story points completed in the selected period.",
      formula: "Sum of story points on done items",
      calculation: `${fmt(currentVelocity)} SP completed`,
      howToCompare:
        "Compare with the previous sprint and the 3-sprint average. Rising velocity is good only if Say/Do and quality stay stable.",
      trend:
        trendBase && currentCompare && prevCompare
          ? {
              ...trendBase,
              current: currentCompare.done,
              previous: prevCompare.done,
              delta: velocityTrendPct,
              unit: "%",
              better: "up",
            }
          : undefined,
      recent: compareStats.map((s) => ({
        label: s.name,
        value: `${s.done} SP`,
        detail: `${s.doneCount} of ${s.issueCount} items done`,
      })),
      takeaways: [
        `Peak sprint in this window: ${peakSprint?.done ?? 0} SP (${peakSprint?.name ?? "n/a"}).`,
        `3-sprint average: ${avgLastThree} SP.`,
        `Latest sprint: ${lastSprint?.done ?? 0} SP completed.`,
      ],
    },
    "Future Predictability": {
      what:
        "Percentage of planned features expected to be delivered by their due date. A feature is forecast to finish on time when its estimated remaining work can be completed by its due date based on the team's delivery rate.",
      formula:
        "Features forecast to finish on or before due date ÷ planned features with a future due date × 100",
      calculation:
        futurePredictability.plannedCount > 0
          ? `${futurePredictability.onTimeCount} of ${futurePredictability.plannedCount} features forecast on time = ${futurePredictability.score}% (team rate ${futurePredictability.dailyRate} SP/day over the last ${RATE_WINDOW_DAYS} days)`
          : `No planned features with a future due date in the current scope (${futurePredictability.pastDueCount} past-due features are listed as Past Due in the popup).`,
      howToCompare:
        "Open the popup and filter the Reason column: 'On Forecast' features are safe at the current pace, 'At Risk' features need more capacity or a scope change. Compare with the 85% target.",
      target: {
        label: "On track",
        value: 85,
        current: futurePredictability.score,
        unit: "%",
        direction: "atLeast",
      },
      recent: [
        {
          label: "Planned features",
          value: String(futurePredictability.plannedCount),
          detail: "Not done, due date in the future",
        },
        {
          label: "Forecast on time",
          value: String(futurePredictability.onTimeCount),
          detail: `At the current ${futurePredictability.dailyRate} SP/day rate`,
        },
        {
          label: "Past due",
          value: String(futurePredictability.pastDueCount),
          detail: "Not done and already past their due date",
        },
      ],
      takeaways:
        futurePredictability.plannedCount === 0
          ? [
              "No features with a future due date are open right now.",
              futurePredictability.pastDueCount > 0
                ? `${futurePredictability.pastDueCount} feature(s) are already past due.`
                : "Nothing scheduled head — update due dates to make this card meaningful.",
            ]
          : [
              futurePredictability.score >= 85
                ? "On or above the 85% target at the current delivery rate."
                : `${85 - futurePredictability.score} pp below the 85% target at the current delivery rate.`,
              futurePredictability.dailyRate <= 0
                ? "No completed SP in the last 30 days, so every feature with remaining work is forecast late."
                : `Delivery rate used for the forecast: ${futurePredictability.dailyRate} SP/day over the last ${RATE_WINDOW_DAYS} days.`,
            ],
    },
  };

  // 13. Issue Explorer List
  const issueList: IssueRow[] = activeItems.map((it) => ({
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
    reason: futurePredictability.reasons.get(it.key),
  }));

  // Sprint → team mapping, so the sprint filter shows whose sprint it is.
  const sprintTeams = new Map<string, Set<string>>();
  activeItems.forEach((it) => {
    const team = it.team || it.podName;
    (it.sprints || []).forEach((s) => {
      const key = s.trim();
      if (!key) return;
      if (!sprintTeams.has(key)) sprintTeams.set(key, new Set());
      sprintTeams.get(key)!.add(team);
    });
  });

  // Sprints filter list — only sprints that have work and are inside the plot window.
  const sprints: SprintOption[] = [
    { id: "all", name: "All Sprints", sub: `Latest ${windowNames.length} sprints` },
    ...windowNames.map((name, i) => ({
      id: name,
      name: sprintDisplayName(name),
      sub: Array.from(sprintTeams.get(name) || []).join(", ") || `Sprint ${i + 1}`,
    })),
  ];

  return {
    pods: derivePods(workItems),
    quarters: deriveQuarters(workItems),
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
    metricInsights,
  };
}

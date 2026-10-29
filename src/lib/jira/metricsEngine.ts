import {
  ContributorSlippage,
  DashboardData,
  MetricConfig,
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
 * Site-tunable rules that feed the metrics. The server resolves these from
 * env and passes them down (the raw feed carries them so the browser computes
 * with the exact same rules); defaults match the documented env fallbacks.
 */
export function resolveMetricConfig(): MetricConfig {
  return {
    doneStatuses: (process.env.JIRA_DONE_STATUSES || "Done,Accepted,Released,Closed,Resolved")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    subtaskDoneStatuses: (
      process.env.JIRA_SUBTASK_DONE_STATUSES ||
      "Done,Closed,Resolved,Completed,Released,Accepted"
    )
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    sprintWindow: Math.max(1, Number(process.env.JIRA_SPRINT_WINDOW || 5)),
    nextSprintRevealDays: Number(process.env.JIRA_NEXT_SPRINT_REVEAL_DAYS || 5),
  };
}

const DEFAULT_METRIC_CONFIG: MetricConfig = resolveMetricConfig();

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

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * Weekdays between two instants. The end date is excluded because it is the
 * deadline, not a full day of capacity. Public holidays are not modelled.
 */
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
 * Future Predictability — share of planned features (not done, due date in the
 * future) forecast to finish on or before their due date.
 *
 * Remaining work is the sum of open child story points. A feature's own story
 * points are used only when it has no estimated children. Capacity is based on
 * weekdays (not calendar days) so weekends do not inflate the forecast.
 * Features without any remaining estimate are excluded from the score and
 * reported separately instead of being counted as "on time".
 */
export function computeFuturePredictability(
  items: JiraWorkItem[],
  isDone: (status: string) => boolean,
  childSource: JiraWorkItem[] = items
) {
  const now = Date.now();
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const rateStart = startOfToday - RATE_WINDOW_DAYS * DAY_MS;
  const recentDoneSP = childSource
    .filter(
      (it) =>
        isDone(it.status) &&
        it.resolutionDate &&
        new Date(it.resolutionDate).getTime() >= rateStart &&
        new Date(it.resolutionDate).getTime() <= now
    )
    .reduce((sum, it) => sum + (it.storyPoints || 0), 0);
  const rateWorkingDays = Math.max(1, workingDaysBetween(rateStart, now + DAY_MS));
  // ponytail: flat SP/working-day rate over 30 days; per-pod rates if the single rate mispredicts.
  const dailyRate = recentDoneSP / rateWorkingDays;

  // Sites without a "Feature" issue type report feature-level work as Epics.
  const hasFeatureType = childSource.some((it) => /^feature$/i.test(it.workType));
  const isFeature = (it: JiraWorkItem) =>
    hasFeatureType ? /^feature$/i.test(it.workType) : /^epic$/i.test(it.workType);

  const isFutureDated = (it: JiraWorkItem) =>
    Boolean(it.dueDate) && new Date(it.dueDate as string).getTime() >= startOfToday;

  // Remaining work belongs to the feature, but is estimated on its descendant
  // stories. Walk the full parent tree so Feature → Epic → Story hierarchies work.
  const childrenByParent = new Map<string, JiraWorkItem[]>();
  childSource.forEach((it) => {
    if (!it.parentKey) return;
    if (/^sub-?task$/i.test(it.workType)) return;
    if (!childrenByParent.has(it.parentKey)) childrenByParent.set(it.parentKey, []);
    childrenByParent.get(it.parentKey)!.push(it);
  });

  const remainingUnder = (
    item: JiraWorkItem,
    seen = new Set<string>()
  ): { remaining: number; hasEstimate: boolean } => {
    if (seen.has(item.key)) return { remaining: 0, hasEstimate: false };
    seen.add(item.key);
    const children = childrenByParent.get(item.key) || [];
    if (children.length === 0) {
      const sp = item.storyPoints || 0;
      return { remaining: isDone(item.status) ? 0 : sp, hasEstimate: sp > 0 };
    }
    let remaining = 0;
    let hasEstimate = false;
    for (const child of children) {
      const childResult = remainingUnder(child, seen);
      hasEstimate = hasEstimate || childResult.hasEstimate;
      if (!isDone(child.status)) remaining += childResult.remaining;
    }
    if (!hasEstimate && (item.storyPoints || 0) > 0) {
      return {
        remaining: isDone(item.status) ? 0 : item.storyPoints || 0,
        hasEstimate: true,
      };
    }
    return { remaining, hasEstimate };
  };

  const planned = items.filter(
    (it) => isFeature(it) && !isDone(it.status) && isFutureDated(it)
  );
  const pastDue = items.filter(
    (it) => isFeature(it) && !isDone(it.status) && !isFutureDated(it) && !!it.dueDate
  );

  const forecastable = planned.filter((it) => remainingUnder(it).hasEstimate);
  const onTimeCount = forecastable.filter((it) => {
    const { remaining } = remainingUnder(it);
    if (dailyRate <= 0) return remaining === 0;
    const days = workingDaysBetween(startOfToday, new Date(it.dueDate as string).getTime());
    return remaining <= dailyRate * days;
  }).length;

  const reasons = new Map<string, string>();
  planned.forEach((it) => {
    const { remaining, hasEstimate } = remainingUnder(it);
    if (!hasEstimate) {
      reasons.set(it.key, "No Estimate (add story points to child work)");
      return;
    }
    if (dailyRate <= 0) {
      reasons.set(
        it.key,
        remaining === 0
          ? "On Forecast (no remaining work)"
          : "At Risk (no recent delivery rate)"
      );
      return;
    }
    const days = workingDaysBetween(startOfToday, new Date(it.dueDate as string).getTime());
    const capacity = Math.round(dailyRate * days * 10) / 10;
    reasons.set(
      it.key,
      remaining <= dailyRate * days
        ? `On Forecast (${remaining} SP ≤ ${capacity} SP capacity in ${days} working days)`
        : `At Risk (${remaining} SP > ${capacity} SP capacity in ${days} working days)`
    );
  });
  pastDue.forEach((it) => reasons.set(it.key, "Past Due (missed due date)"));

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
  sprintMeta: Record<string, SprintMeta> = {},
  config: MetricConfig = DEFAULT_METRIC_CONFIG
): DashboardData {
  const { podId, quarterId, sprintId } = filters;
  const DONE_STATUSES = new Set(config.doneStatuses);
  const SUBTASK_DONE_STATUSES = new Set(config.subtaskDoneStatuses);
  // How many recent sprints to plot; a future sprint is surfaced when the
  // active sprint is this close to ending.
  const SPRINT_WINDOW = Math.max(1, Number(config.sprintWindow) || 1);
  const NEXT_SPRINT_REVEAL_DAYS = Math.max(0, Number(config.nextSprintRevealDays) || 0);
  // Sub-tasks often use a simpler workflow than their parent story.
  const isSubtaskDoneStatus = (status: string) =>
    DONE_STATUSES.has(status) || SUBTASK_DONE_STATUSES.has(status);

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

  // Developer View is explicitly Story + Sub-task. Subtasks are kept out of
  // every other metric, but contributors need their real execution items.
  // Sub-tasks often have no sprint/quarter of their own, so inherit those from
  // the parent before applying the tab filters.
  const itemByKey = new Map(items.map((item) => [item.key, item]));
  const withParentContext = (item: JiraWorkItem): JiraWorkItem => {
    if (!/^sub-?task$/i.test(item.workType) || !item.parentKey) return item;
    const parent = itemByKey.get(item.parentKey);
    if (!parent) return item;
    return {
      ...item,
      sprints: item.sprints && item.sprints.length > 0 ? item.sprints : parent.sprints,
      quarter:
        item.quarter && item.quarter !== "All" ? item.quarter : parent.quarter,
      podName:
        item.podName && item.podName !== item.team ? item.podName : parent.podName,
      team: item.team || parent.team,
    };
  };
  const developerItems = items
    .map(withParentContext)
    .filter((item) => {
      if (!/^(story|sub-?task)$/i.test(item.workType)) return false;
      if (podId !== "all" && item.podKey !== podId) return false;
      if (quarterId !== "all" && item.quarter !== quarterId) return false;
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
  let currentVelocity = scopeDoneSP;
  let velocityPodCount = 0;
  let globalPodPools: Map<string, JiraWorkItem[]> | null = null;

  // Two-level average for the global "All Pods / All Quarters / All Sprints"
  // view: average each pod's sprint velocity first, then average the pods.
  // This stops a large pod from dominating the enterprise average. Every
  // other filter combination keeps the existing calculation.
  const isGlobalAll =
    podId === "all" && quarterId === "all" && sprintId === "all";
  if (isGlobalAll) {
    // Velocity only counts accepted (done) items with real story points.
    // Zero-SP items (including subtasks) cannot contribute velocity.
    const velocityItems = activeItems.filter(
      (it) => DONE_STATUSES.has(it.status) && (it.storyPoints || 0) > 0
    );
    const podPools = new Map<string, JiraWorkItem[]>();
    velocityItems.forEach((it) => {
      const key = it.podKey || "UNKNOWN";
      if (!podPools.has(key)) podPools.set(key, []);
      podPools.get(key)!.push(it);
    });

    const podAverages: number[] = [];
    podPools.forEach((pool) => {
      const podSprints = windowNames.filter((name) =>
        pool.some((it) => matchesSprint(it.sprints, name))
      );
      if (!podSprints.length) return;
      const perSprint = podSprints.map(
        (name) => buildSprintStat(name, pool).done
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
    globalPodPools = podPools;
  }

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

  // Keep the global trend consistent with the two-level average: compare the
  // pod-averaged velocity of the latest sprint with the previous sprint.
  let effectiveVelocityTrendPct = velocityTrendPct;
  let velocityCompareCurrent = currentCompare?.done ?? 0;
  let velocityComparePrevious = prevCompare?.done ?? 0;
  if (isGlobalAll && globalPodPools && hasComparison && currentCompare && prevCompare) {
    const podAvgForSprint = (name: string) => {
      const vals: number[] = [];
      globalPodPools!.forEach((pool) => {
        if (!pool.some((it) => matchesSprint(it.sprints, name))) return;
        vals.push(buildSprintStat(name, pool).done);
      });
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };
    velocityCompareCurrent = podAvgForSprint(currentCompare.fullName);
    velocityComparePrevious = podAvgForSprint(prevCompare.fullName);
    effectiveVelocityTrendPct = pctChange(
      velocityCompareCurrent,
      velocityComparePrevious
    );
  }

  // Show the size of the change; the card appends better/worse.
  const trendText = (delta: number, unit: string) =>
    !hasComparison
      ? "No previous sprint"
      : delta === 0
      ? "No change"
      : `${Math.abs(Math.round(delta))} ${unit}`;
  const sayDoTrendText = trendText(sayDoTrend, "pts");
  const carryTrendText = trendText(
    carryTrend,
    Math.abs(carryTrend) === 1 ? "pt" : "pts"
  );
  const velocityTrendText = !hasComparison
    ? "No previous sprint"
    : velocityCompareCurrent === velocityComparePrevious
    ? "No change"
    : `${Math.abs(Math.round(velocityCompareCurrent - velocityComparePrevious))} SP`;

  const predictabilityScore =
    scopeCommittedSP > 0 ? Math.round((scopeDoneSP / scopeCommittedSP) * 100) : 0; // (kept for the Predictability tab)
  // Feature children can live outside the selected quarter; gather them from the
  // pod scope so remaining work is not understated.
  const forecastChildSource = workItems.filter(
    (item) => podId === "all" || item.podKey === podId
  );
  // Features often have no quarter/sprint of their own. A feature counts as
  // "planned" in the current scope when it is in scope itself or is an
  // ancestor of an item in the current scope. Features with no link and no
  // sprint stay in the All/All view only.
  const featureTypeRe = workItems.some((it) => /^feature$/i.test(it.workType))
    ? /^feature$/i
    : /^epic$/i;
  const activeKeys = new Set(activeItems.map((it) => it.key));
  const featureKeys = new Set<string>();
  for (const item of activeItems) {
    let cursor: JiraWorkItem | undefined = item;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor.key)) {
      seen.add(cursor.key);
      if (featureTypeRe.test(cursor.workType)) {
        featureKeys.add(cursor.key);
        break;
      }
      cursor = cursor.parentKey ? itemByKey.get(cursor.parentKey) : undefined;
    }
  }
  const devFeaturePool = forecastChildSource.filter(
    (it) => featureTypeRe.test(it.workType) &&
      (activeKeys.has(it.key) || featureKeys.has(it.key))
  );
  const futurePredictability = computeFuturePredictability(
    devFeaturePool,
    (s) => DONE_STATUSES.has(s),
    forecastChildSource
  );
  const futureTrendText =
    futurePredictability.forecastableCount > 0
      ? `${futurePredictability.onTimeCount} of ${futurePredictability.forecastableCount}`
      : futurePredictability.plannedCount > 0
      ? "No estimated features"
      : "No planned features";

  const trendLabelFor = () =>
    !prevCompare || !currentCompare
      ? ""
      : `${currentCompare.name} vs ${prevCompare.name}`;

  const metrics: MetricCardData[] = [
    {
      title: "Say/Do Ratio",
      value: `${sayDoRatio}%`,
      subtitle: "Completed committed SP ÷ committed SP",
      trend: sayDoTrend,
      trendLabel: trendLabelFor(),
      trendUnit: "pp",
      trendText: sayDoTrendText,
      color: sayDoRatio >= 80 ? "green" : sayDoRatio >= 65 ? "blue" : "red",
      trendGood: "up",
      drilldownTab: "diagnosis",
    },
    {
      title: "Sprint Carry Over",
      value: `${carryOver}%`,
      subtitle: "Spilled-over committed SP ÷ committed SP",
      trend: carryTrend,
      trendLabel: trendLabelFor(),
      trendUnit: "pp",
      trendText: carryTrendText,
      color: carryOver <= 18 ? "green" : carryOver <= 28 ? "blue" : "red",
      trendGood: "down",
      drilldownTab: "diagnosis",
    },
    {
      title: isGlobalAll ? "Avg. Sprint Velocity" : "Total Sprint Velocity",
      value: `${currentVelocity} pts`,
      subtitle:
        sprintId === "all"
          ? isGlobalAll
            ? `Average SP per sprint across ${velocityPodCount} pods`
            : `SP completed across ${windowNames.length} sprints`
          : "SP completed in selected sprint",
      trend: effectiveVelocityTrendPct,
      trendLabel: trendLabelFor(),
      trendUnit: "%",
      trendText: velocityTrendText,
      color: "blue",
      trendGood: "up",
      drilldownTab: "executive",
    },
    {
      title: "Future Predictability",
      value:
        futurePredictability.forecastableCount > 0
          ? `${futurePredictability.score}%`
          : "N/A",
      subtitle:
        futurePredictability.forecastableCount > 0
          ? "Forecast on-time estimated features ÷ estimated features (future due dates)"
          : futurePredictability.plannedCount > 0
          ? "No estimated remaining work on planned features"
          : "No late-stage features with future due dates",
      trend: 0,
      trendLabel:
        futurePredictability.forecastableCount > 0
          ? "features on time"
          : "for forecast",
      trendUnit: "pp",
      trendText: futureTrendText,
      color:
        futurePredictability.forecastableCount === 0
          ? "blue"
          : futurePredictability.score >= 85
          ? "green"
          : futurePredictability.score >= 50
          ? "blue"
          : "red",
      trendGood: "up",
      drilldownTab: "predictability",
    },
  ];

  // 7. Developer Breakdown (Story + Sub-task only)
  const estimateHours = (seconds?: number) =>
    Math.round(((seconds || 0) / 3600) * 10) / 10;

  const devMap = new Map<
    string,
    {
      assigned: number;
      done: number;
      stories: number;
      subtasks: number;
      completedStories: number;
      completedSubtasks: number;
      deliveredSP: number;
      totalSP: number;
      originalEstimateSeconds: number;
      completedEstimateSeconds: number;
      team: string;
    }
  >();
  developerItems.forEach((it) => {
    const devName = it.assignee || "Unassigned";
    const existing =
      devMap.get(devName) || {
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
        team: it.team || it.podName,
      };
    const isSubtask = /^sub-?task$/i.test(it.workType);
    const isDone = isSubtask ? isSubtaskDoneStatus(it.status) : DONE_STATUSES.has(it.status);

    existing.assigned += 1;
    existing.totalSP += it.storyPoints || 0;
    existing.originalEstimateSeconds += it.originalEstimateSeconds || 0;
    if (isSubtask) existing.subtasks += 1;
    else existing.stories += 1;

    if (isDone) {
      existing.done += 1;
      existing.deliveredSP += it.storyPoints || 0;
      existing.completedEstimateSeconds += it.originalEstimateSeconds || 0;
      if (isSubtask) existing.completedSubtasks += 1;
      else existing.completedStories += 1;
    }
    devMap.set(devName, existing);
  });

  const developers: DeveloperStat[] = Array.from(devMap.entries())
    .map(([name, stat]) => ({
      name,
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
    epicsOnSchedule: futurePredictability.score,
    forecastableFeatures: futurePredictability.forecastableCount,
    unestimatedFeatures: futurePredictability.unestimatedCount,
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
              display: `${Math.round(sayDoPercent(prevCompare))}% → ${Math.round(sayDoPercent(currentCompare))}%`,
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
              display: `${Math.round(carryPercent(prevCompare))}% → ${Math.round(carryPercent(currentCompare))}%`,
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
    "Avg. Sprint Velocity": {
      what:
        "Average story points completed per sprint. With All Pods, All Quarters, and All Sprints selected, it averages each pod's sprint velocity first, then averages the pods, so one large pod cannot dominate.",
      formula: isGlobalAll
        ? "Mean of each pod's average sprint velocity"
        : "Sum of story points on done items",
      calculation: isGlobalAll
        ? `${fmt(currentVelocity)} SP average per sprint across ${velocityPodCount} pods`
        : `${fmt(currentVelocity)} SP completed`,
      howToCompare:
        "Compare with the previous sprint and the 3-sprint average. Rising velocity is good only if Say/Do and quality stay stable.",
      trend:
        trendBase && currentCompare && prevCompare
          ? {
              ...trendBase,
              current: currentCompare.done,
              previous: prevCompare.done,
              delta: effectiveVelocityTrendPct,
              unit: "%",
              better: "up",
              display: `${Math.round(velocityComparePrevious)} SP → ${Math.round(velocityCompareCurrent)} SP`,
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
        "Percentage of estimated planned features expected to be delivered by their due date. Remaining work is the sum of open child story points; capacity is based on weekdays and the team's recent delivery rate.",
      formula:
        "Estimated features forecast to finish on or before due date ÷ estimated features with a future due date × 100",
      calculation:
        futurePredictability.forecastableCount > 0
          ? `${futurePredictability.onTimeCount} of ${futurePredictability.forecastableCount} estimated features forecast on time = ${futurePredictability.score}% (${futurePredictability.dailyRate} SP/working day over ${futurePredictability.rateWorkingDays} working days).`
          : futurePredictability.plannedCount > 0
          ? `${futurePredictability.plannedCount} planned feature(s) have no remaining SP estimate. Add story points to child stories to make them forecastable.`
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
          label: "Estimated for forecast",
          value: String(futurePredictability.forecastableCount),
          detail: `${futurePredictability.unestimatedCount} without a remaining SP estimate`,
        },
        {
          label: "Forecast on time",
          value: String(futurePredictability.onTimeCount),
          detail: `At ${futurePredictability.dailyRate} SP per working day`,
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
                : "Nothing scheduled ahead — update due dates to make this card meaningful.",
            ]
          : futurePredictability.forecastableCount === 0
          ? [
              "Planned features exist, but none have remaining story points on themselves or their child stories.",
              "Add story points to the open child stories so the forecast can compare work against capacity.",
            ]
          : [
              futurePredictability.score >= 85
                ? "On or above the 85% target at the current delivery rate."
                : `${85 - futurePredictability.score} pp below the 85% target at the current delivery rate.`,
              futurePredictability.dailyRate <= 0
                ? "No completed SP in the last 30 days, so every estimated feature with remaining work is forecast late."
                : `Forecast uses ${futurePredictability.dailyRate} SP per working day over the last ${RATE_WINDOW_DAYS} calendar days (${futurePredictability.rateWorkingDays} working days).`,
              futurePredictability.unestimatedCount > 0
                ? `${futurePredictability.unestimatedCount} planned feature(s) are excluded because they have no remaining SP estimate.`
                : "Every planned feature has a remaining SP estimate.",
            ],
    },
  };

  // Total Sprint Velocity is the same card for non-global filters; keep its
  // popup explanation aligned with the title.
  metricInsights["Total Sprint Velocity"] = {
    ...metricInsights["Avg. Sprint Velocity"],
    what:
      "Total story points completed in the selected Pod, Quarter, and Sprint scope.",
    formula: "Sum of story points on done items",
  };

  // 13. Issue Explorer List
  const toIssueRow = (it: JiraWorkItem): IssueRow => ({
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
    dueDate: it.dueDate || "",
    isDone: DONE_STATUSES.has(it.status),
    originalEstimateHours: estimateHours(it.originalEstimateSeconds),
    reason: futurePredictability.reasons.get(it.key),
  });
  const issueList: IssueRow[] = activeItems.map(toIssueRow);

  const podFeatureList: IssueRow[] = devFeaturePool.map(toIssueRow);

  const developerIssueList: IssueRow[] = developerItems.map((it) => ({
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
    isDone: /^sub-?task$/i.test(it.workType)
      ? isSubtaskDoneStatus(it.status)
      : DONE_STATUSES.has(it.status),
    originalEstimateHours: estimateHours(it.originalEstimateSeconds),
    isSubtask: /^sub-?task$/i.test(it.workType),
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
    developerIssueList,
    podFeatureList,
    metricInsights,
  };
}

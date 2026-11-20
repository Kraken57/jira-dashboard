import { commonizeSprints, computeDashboardData, sprintLifecycle } from "@/lib/jira/metricsEngine";
import { featureDelivery } from "@/lib/jira/featureDelivery";
import type { DashboardFilters, JiraWorkItem, RawFeedPayload, SprintMeta } from "@/lib/jira/types";

export interface ReportSheetData {
  name: string;
  description: string;
  headers: string[];
  rows: (string | number | null)[][];
  summaryRows?: number[];
  percentColumns?: number[];
  decimalColumns?: number[];
}

type ReportFilters = DashboardFilters;
const ALL_REPORT_FILTERS: ReportFilters = {
  podId: "all",
  quarterId: "all",
  sprintId: "all",
  sprintStatus: "all",
};

type Pod = { id: string; name: string };
type Sprint = { id: string; label: string; quarter: string; timeline: string; order: number; state: string };

const selection = (value: string | string[]) => Array.isArray(value) ? value : [value];
const isAll = (value: string | string[]) => selection(value).includes("all");
const round = (value: number, places = 1) => Number(value.toFixed(places));
const clean = (value: string) => value.replace(/\s+/g, " ").trim();

function dateLabel(meta?: SprintMeta): string {
  const start = meta?.startDate || meta?.dateRanges?.[0]?.startDate;
  const end = meta?.endDate || meta?.dateRanges?.[0]?.endDate;
  if (!start || !end) return "Dates not set";
  const fmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const a = new Date(start);
  const b = new Date(end);
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return "Dates not set";
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
  const fmtShort = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
  return sameYear ? `${fmtShort.format(a)} – ${fmt.format(b)}` : `${fmt.format(a)} – ${fmt.format(b)}`;
}

function numeric(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function metricValue(data: ReturnType<typeof computeDashboardData>, title: string): number | null {
  const card = data.metrics.find((item) => item.title === title);
  const match = String(card?.value ?? "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function quarterFromName(name: string): string {
  const standard = name.match(/CY(\d{2})\s*PI\.?\s*(\d)/i);
  if (standard) return `CY${standard[1]} PI.${Number(standard[2])}`;
  const legacy = name.match(/(\d{4})\s*-?\s*Q\s*(\d)/i);
  if (legacy) return `CY${legacy[1].slice(2)} PI.${Number(legacy[2])}`;
  return "Not available";
}

function makeSprintRows(
  feed: RawFeedPayload,
  filters: ReportFilters,
  allScope: ReturnType<typeof computeDashboardData>,
  aliases: Map<string, string>,
) {
  const requestedSprints = selection(filters.sprintId);
  const sprintRows = allScope.sprints
    .filter((sprint) => sprint.id !== "all" && (requestedSprints.includes("all") || requestedSprints.includes(sprint.id)))
    .map((sprint, index) => {
      const sourceNames = [...aliases.entries()].filter(([, id]) => id === sprint.id).map(([name]) => name);
      const states = sourceNames
        .filter((name) => !filters.sprintStatus || filters.sprintStatus === "all" || sprintLifecycle(feed.sprintMeta[name]) === filters.sprintStatus)
        .map((name) => feed.sprintMeta[name]?.state)
        .filter(Boolean);
      const sourceRange = sourceNames.map((name) => feed.sprintMeta[name]).find((meta) => meta?.startDate && meta?.endDate);
      return {
        id: sprint.id,
        label: clean(sprint.name),
        quarter: sprint.id.split("::").at(-1)?.startsWith("CY") ? sprint.id.split("::").at(-1)! : quarterFromName(sprint.name),
        timeline: sprint.sub || dateLabel(sourceRange),
        order: index,
        state: states.includes("active") || states.includes("future") ? "open" : states.includes("closed") ? "closed" : "unknown",
      };
    });
  const requestedPods = selection(filters.podId);
  const pods: Pod[] = allScope.pods
    .filter((pod) => requestedPods.includes("all") || requestedPods.includes(pod.id))
    .map((pod) => ({ id: pod.id, name: pod.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { sprints: sprintRows, pods };
}

function reportDataFor(feed: RawFeedPayload, filters: ReportFilters, pod: Pod, sprint: Sprint) {
  return computeDashboardData(
    feed.items,
    {
      podId: pod.id,
      quarterId: filters.quarterId,
      sprintId: [sprint.id],
      sprintStatus: filters.sprintStatus,
    },
    feed.sprintMeta,
    feed.config,
    feed.zephyr,
  );
}

function commonSprintAliases(feed: RawFeedPayload, filters: ReportFilters) {
  const grouped = commonizeSprints(feed.items, feed.sprintMeta, {
    ...filters,
    sprintId: "all",
  });
  return grouped.aliases;
}

function rowInScope(
  item: { key: string; podKey?: string; projectKey?: string; sprint?: string },
  rawByKey: Map<string, JiraWorkItem>,
  filters: ReportFilters,
  aliases: Map<string, string>,
  sprintIds: Set<string>,
  sprintMeta: Record<string, SprintMeta>,
): boolean {
  const raw = rawByKey.get(item.key);
  const key = raw?.podKey || item.podKey || item.projectKey || "";
  if (!isAll(filters.podId) && !selection(filters.podId).includes(key)) return false;
  const sourceSprintNames = raw?.sprints?.length
    ? raw.sprints
    : (item.sprint || "").split(",").map((name) => name.trim()).filter((name) => name && name !== "Backlog");
  const quarterValues = selection(filters.quarterId);
  if (!quarterValues.includes("all")) {
    const quarters = sourceSprintNames.map((name) => aliases.get(name)?.split("::").at(-1) || quarterFromName(name)).filter(Boolean);
    if (!quarters.some((quarter) => quarterValues.includes(quarter!))) return false;
  }
  if (!selection(filters.sprintId).includes("all")) {
    if (!sourceSprintNames.some((name) => sprintIds.has(aliases.get(name) || name))) return false;
  }
  if (filters.sprintStatus && filters.sprintStatus !== "all") {
    if (!sourceSprintNames.some((name) => sprintLifecycle(sprintMeta[name]) === filters.sprintStatus)) return false;
  }
  return true;
}

function scopedDefectRows(
  rows: RawFeedPayload["qaDefects"],
  feed: RawFeedPayload,
  filters: ReportFilters,
  aliases: Map<string, string>,
  sprintIds: Set<string>,
  rawByKey: Map<string, JiraWorkItem>,
) {
  if (!rows) return null;
  return [...new Map(rows
    .filter((row) => rowInScope(row, rawByKey, filters, aliases, sprintIds, feed.sprintMeta))
    .filter((row) => /^bug$/i.test(row.workType))
    .map((row) => [row.key, row] as const)).values()];
}

function buildDefectLeakageSheet(
  feed: RawFeedPayload,
  filters: ReportFilters,
  pods: Pod[],
  sprints: Sprint[],
  aliases: Map<string, string>,
): ReportSheetData {
  const sprintIds = new Set(sprints.map((sprint) => sprint.id));
  const rawByKey = new Map(feed.items.map((item) => [item.key, item]));
  const metrics = [
    "Stories Tested",
    "Test Cases Executed",
    "Defects Identified in QA",
    "Defects Identified in UAT",
    "Escaped Defects",
  ];
  const rows = metrics.map((metric) => [metric, ...pods.map((pod) => {
    if (metric === "Stories Tested" || metric === "Test Cases Executed") {
      if (!feed.zephyr?.available || !feed.zephyr.cases) return "N/A";
      const podCases = feed.zephyr.cases.filter((testCase) => {
        const podMatch = testCase.podKeys.includes(pod.id) || testCase.podNames.some((name) => clean(name).toLowerCase() === clean(pod.name).toLowerCase());
        if (!podMatch) return false;
        const linked = testCase.linkedIssueKeys.map((key) => rawByKey.get(key)).filter((item): item is JiraWorkItem => Boolean(item));
        const sourceSprintNames = linked.flatMap((item) => item.sprints || []).concat(testCase.sprints || []);
        if (!isAll(filters.quarterId) && !sourceSprintNames.some((name) => selection(filters.quarterId).includes(aliases.get(name)?.split("::").at(-1) || ""))) return false;
        if (!selection(filters.sprintId).includes("all") && !sourceSprintNames.some((name) => sprintIds.has(aliases.get(name) || name))) return false;
        if (filters.sprintStatus && filters.sprintStatus !== "all" && sourceSprintNames.length) {
          const inState = sourceSprintNames.some((name) => aliases.get(name) && feed.sprintMeta[name]?.state === filters.sprintStatus);
          if (!inState) return false;
        }
        return true;
      });
      if (metric === "Stories Tested") {
        const traceableCases = podCases.filter((testCase) => testCase.linkedIssueKeys.length > 0);
        if (traceableCases.length === 0) return "N/A";
        const testedStories = new Set(traceableCases
          .filter((testCase) => testCase.executionCount > 0)
          .flatMap((testCase) => testCase.linkedIssueKeys)
          .filter((key) => /^story$/i.test(rawByKey.get(key)?.workType || "")));
        return testedStories.size;
      }
      return podCases.filter((testCase) => testCase.executionCount > 0).length;
    }
    const source = metric === "Defects Identified in QA" ? feed.qaDefects : metric === "Defects Identified in UAT" ? feed.qaUatDefects : feed.qaLeakageDefects;
    if (!source) return "N/A";
    return scopedDefectRows(source, feed, { ...filters, podId: [pod.id] }, aliases, sprintIds, rawByKey)?.length ?? "N/A";
  })]);
  const partial = feed.zephyr?.message?.toLowerCase().includes("partial");
  return {
    name: "Defect Leakage",
    description: `Counts use Jira defect feeds and Zephyr executions across all loaded dashboard data. Stories Tested counts distinct traceability-linked stories with at least one execution; N/A means Zephyr data or story links are unavailable.${partial ? " Zephyr results are partial." : ""}`,
    headers: ["Metric", ...pods.map((pod) => pod.id)],
    rows,
  };
}

export function buildReportSheets(feed: RawFeedPayload): ReportSheetData[] {
  const filters = ALL_REPORT_FILTERS;
  const allFilters: DashboardFilters = { ...filters, sprintId: "all" };
  const allScope = computeDashboardData(feed.items, allFilters, feed.sprintMeta, feed.config, feed.zephyr);
  const aliases = commonSprintAliases(feed, filters);
  const { sprints, pods } = makeSprintRows(feed, filters, allScope, aliases);
  const byPodSprint = new Map<string, ReturnType<typeof computeDashboardData>>();
  const dataFor = (pod: Pod, sprint: Sprint) => {
    const key = `${pod.id}\u0000${sprint.id}`;
    if (!byPodSprint.has(key)) byPodSprint.set(key, reportDataFor(feed, filters, pod, sprint));
    return byPodSprint.get(key)!;
  };
  const pairs = pods.flatMap((pod) => sprints.map((sprint) => ({ pod, sprint, data: dataFor(pod, sprint) })));

  const velocityRows: (string | number | null)[][] = sprints.map((sprint) => {
    const values = pods.map((pod) => {
      const data = dataFor(pod, sprint);
      return data.velocity.labels.length ? data.velocity.totalFinished : null;
    });
    const available = values.filter((value): value is number => value !== null && Number.isFinite(value));
    return [sprint.quarter, sprint.label, sprint.timeline, ...values, available.length ? round(available.reduce((sum, value) => sum + value, 0) / available.length) : null];
  });
  const velocityAverages = pods.map((_, index) => {
    const values = velocityRows.map((row) => row[index + 3]).filter((value): value is number => typeof value === "number");
    return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  });
  const podAverages = velocityAverages.filter((value): value is number => value !== null);
  velocityRows.push(["AVERAGE", "Average across all loaded sprints", "", ...velocityAverages, podAverages.length ? round(podAverages.reduce((sum, value) => sum + value, 0) / podAverages.length) : null]);

  const featureRows: (string | number | null)[][] = [];
  for (const { pod, sprint, data } of pairs) {
    const features = data.podFeatureList || [];
    const sourceItems = feed.items.filter((item) => item.podKey === pod.id);
    const details = features.flatMap((feature) => {
      const sourceFeature = sourceItems.find((item) => item.key === feature.key);
      return sourceFeature
        ? [{ feature, delivery: featureDelivery(sourceFeature, sourceItems, feed.config.doneStatuses) }]
        : [];
    });
    const delivered = details.filter(({ delivery }) => delivery.status === "Delivered").length;
    const predictable = details.filter(({ delivery }) => delivery.predictable).length;
    const deliveredSP = details.reduce((sum, { delivery }) => sum + delivery.completedStoryPoints, 0);
    const loggedHours = details.reduce((sum, { delivery }) => sum + delivery.hours, 0);
    featureRows.push([sprint.quarter, sprint.label, sprint.timeline, pod.id, details.length, delivered, predictable,
      details.length ? round(predictable / details.length * 100, 0) : null, round(deliveredSP), round(loggedHours)]);
  }
  const featureNumericCols = [4, 5, 6, 8, 9];
  const featureMeans = featureNumericCols.map((column) => {
    const values = featureRows.map((row) => row[column]).filter((value) => typeof value === "number") as number[];
    return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  });
  featureRows.push(["AVERAGE", "Average per pod-sprint", "", "", featureMeans[0], featureMeans[1], featureMeans[2],
    featureRows.length ? round(featureRows.reduce((sum, row) => sum + numeric(row[7]), 0) / featureRows.length, 0) : null,
    featureMeans[3], featureMeans[4]]);
  const featureDataRows = featureRows.slice(0, -1);
  const totalPlannedFeatures = featureDataRows.reduce((sum, row) => sum + numeric(row[4]), 0);
  const totalDeliveredFeatures = featureDataRows.reduce((sum, row) => sum + numeric(row[5]), 0);
  const totalPredictableFeatures = featureDataRows.reduce((sum, row) => sum + numeric(row[6]), 0);
  featureRows.push(["TOTAL", "Sum of pod-sprint rows (a feature may appear in multiple sprints)", "", "",
    totalPlannedFeatures, totalDeliveredFeatures, totalPredictableFeatures,
    totalPlannedFeatures ? round(totalPredictableFeatures / totalPlannedFeatures * 100, 0) : null,
    featureDataRows.reduce((sum, row) => sum + numeric(row[8]), 0),
    round(featureDataRows.reduce((sum, row) => sum + numeric(row[9]), 0))]);

  const sayDoRows: (string | number | null)[][] = [];
  for (const { pod, sprint, data } of pairs) {
    const planned = data.delivery.planned[0] ?? 0;
    const delivered = data.delivery.done[0] ?? 0;
    const state = sprint.state;
    const closed = state === "closed";
    sayDoRows.push([sprint.quarter, sprint.label, sprint.timeline, pod.id, state,
      planned, delivered, closed && planned > 0 ? round(delivered / planned * 100, 0) : null]);
  }
  const closedRatios = sayDoRows.map((row) => row[7]).filter((value) => typeof value === "number") as number[];
  sayDoRows.push(["AVERAGE", "Closed sprints only", "", "", "", null, null,
    closedRatios.length ? round(closedRatios.reduce((sum, value) => sum + value, 0) / closedRatios.length, 0) : null]);
  const overallSayDo = metricValue(computeDashboardData(feed.items, filters, feed.sprintMeta, feed.config, feed.zephyr), "Say/Do Ratio");
  sayDoRows.push(["OVERALL", "Dashboard Say/Do across all loaded data", "", "", "", null, null, overallSayDo]);

  const utilizationRows: (string | number | null)[][] = [];
  const efficiencyRows: (string | number | null)[][] = [];
  for (const { pod, sprint, data } of pairs) {
    const developers = data.developers.filter((person) => person.name !== "Unassigned");
    for (const person of developers) {
      const logged = person.loggedHours ?? 0;
      utilizationRows.push([sprint.quarter, sprint.label, sprint.timeline, pod.id, person.name,
        person.capacityHours, round(person.originalEstimateHours), round(logged),
        person.capacityHours > 0 ? round(logged / person.capacityHours * 100, 0) : null]);
    }
    const contributors = data.diagnosis.individualContribution?.people || [];
    for (const person of contributors.filter((entry) => entry.name !== "Unassigned")) {
      const points = person.attributedStoryPoints;
      const hours = person.loggedEffortHours;
      efficiencyRows.push([person.name, pod.id, sprint.quarter, sprint.label, sprint.timeline,
        person.subtaskCount, round(person.originalEstimateHours), round(hours), round(points, 2),
        points > 0 && hours > 0 ? round(hours / points, 2) : null]);
    }
  }
  if (utilizationRows.length) {
    const avg = (column: number) => round(utilizationRows.reduce((sum, row) => sum + numeric(row[column]), 0) / utilizationRows.length);
    const totalCapacity = utilizationRows.reduce((sum, row) => sum + numeric(row[5]), 0);
    const totalLogged = utilizationRows.reduce((sum, row) => sum + numeric(row[7]), 0);
    utilizationRows.push(["AVERAGE", "Average per contributor-sprint", "", "", "", avg(5), avg(6), avg(7), avg(8)]);
    utilizationRows.push(["TOTAL", "Weighted utilization = logged ÷ available", "", "", "", totalCapacity,
      utilizationRows.slice(0, -1).reduce((sum, row) => sum + numeric(row[6]), 0), totalLogged,
      totalCapacity ? round(totalLogged / totalCapacity * 100, 0) : null]);
  }
  const contributorTotals = new Map<string, { estimate: number; hours: number; points: number; tasks: number }>();
  for (const row of efficiencyRows) {
    const person = String(row[0]);
    const current = contributorTotals.get(person) || { estimate: 0, hours: 0, points: 0, tasks: 0 };
    current.estimate += numeric(row[6]); current.hours += numeric(row[7]); current.points += numeric(row[8]); current.tasks += numeric(row[5]);
    contributorTotals.set(person, current);
  }
  const efficiencySummary = [...contributorTotals.entries()].map(([name, total]) => [name, "", "All loaded PIs", "All loaded sprints", "",
    total.tasks, round(total.estimate), round(total.hours), round(total.points, 2), total.points > 0 && total.hours > 0 ? round(total.hours / total.points, 2) : null] as (string | number | null)[]);
  if (efficiencySummary.length) efficiencyRows.push(["", "", "", "", "", null, null, null, null, null], ...efficiencySummary);

  const defectSheet = buildDefectLeakageSheet(feed, filters, pods, sprints, aliases);
  return [
    {
      name: "Velocity",
      description: "Completed story points per sprint and pod across all loaded data. Average is calculated per pod, then averaged across all pods.",
      headers: ["PI", "Sprint", "Timeline", ...pods.map((pod) => pod.id), "Average SP / sprint"],
      rows: velocityRows,
      summaryRows: [velocityRows.length - 1],
      decimalColumns: pods.map((_, index) => index + 3).concat([pods.length + 3]),
    },
    {
      name: "Feature Predictability",
      description: "Counts cover every pod, PI, and sprint in the loaded data. Delivered means all child stories are complete; predictability follows the dashboard due-date rules. Averages are per pod-sprint row.",
      headers: ["PI", "Sprint", "Timeline", "Team", "Features Planned", "Features Delivered", "Predictable Features", "Predictability %", "Delivered SP", "Logged Effort (hrs)"],
      rows: featureRows,
      summaryRows: [featureRows.length - 2, featureRows.length - 1],
      percentColumns: [7],
      decimalColumns: [8, 9],
    },
    {
      name: "Say-Do",
      description: "Planned and delivered SP follow sprint delivery calculations across all pods and sprints. Closed sprint ratios are averaged; open sprint ratios are left blank. Overall value matches the dashboard card for the full scope.",
      headers: ["PI", "Sprint", "Timeline", "Team", "Sprint Status", "SP Planned", "SP Delivered", "Say-Do %"],
      rows: sayDoRows,
      summaryRows: [sayDoRows.length - 2, sayDoRows.length - 1],
      percentColumns: [7],
      decimalColumns: [5, 6],
    },
    {
      name: "Utilization",
      description: "Includes contributors across all pods and sprints. Available capacity is 60 hours per contributor per sprint (10 working days × 6 effective hours). Planned capacity is the sum of original estimates. Utilization is logged effort ÷ available capacity.",
      headers: ["PI", "Sprint", "Timeline", "Team", "Contributor", "Available Capacity (hrs)", "Planned Capacity (hrs)", "Logged Effort (hrs)", "Utilization %"],
      rows: utilizationRows,
      summaryRows: utilizationRows.length ? [utilizationRows.length - 2, utilizationRows.length - 1] : [],
      percentColumns: [8],
      decimalColumns: [5, 6, 7],
    },
    {
      name: "Efficiency by Contributor",
      description: "Includes contributors across all pods and sprints. Story points are attributed by each contributor’s share of original estimates on completed stories. Efficiency is hours per attributed story point. N/A means no points or no logged effort.",
      headers: ["User Name", "Team", "PI", "Sprint", "Timeline", "Assigned Subtasks", "Original Estimates (hrs)", "Logged Effort (hrs)", "Attributed Story Points", "Hours / Story Point"],
      rows: efficiencyRows,
      decimalColumns: [6, 7, 8, 9],
    },
    defectSheet,
  ];
}

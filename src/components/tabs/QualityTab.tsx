"use client";

import { useState } from "react";
import {
  IssueRow,
  QaCapacityData,
  QaMemberStat,
  JiraWorkItem,
  ZephyrData,
} from "@/lib/jira/types";
import { IssuesModal } from "@/components/IssuesModal";
import { DetailModal } from "@/components/DetailModal";

interface QualityTabProps {
  qaCapacity?: QaCapacityData;
  qaRosterConfigured?: number;
  zephyr?: ZephyrData;
  issues?: IssueRow[];
  qualityItems?: JiraWorkItem[];
  doneStatuses?: string[];
  qaDefects?: IssueRow[];
  qaUatDefects?: IssueRow[];
  qaLeakageDefects?: IssueRow[];
  fetchedAt?: number;
  jiraDomain?: string;
}

export function QualityTab({ qaCapacity, qaRosterConfigured = 0, zephyr, issues = [], qualityItems, doneStatuses, qaDefects = [], qaUatDefects, qaLeakageDefects, fetchedAt, jiraDomain }: QualityTabProps) {
  const [modal, setModal] = useState<{
    title: string;
    subtitle: string;
    issues: IssueRow[];
  } | null>(null);
  const [zephyrModal, setZephyrModal] = useState<{ title: string; subtitle: string; cases: NonNullable<ZephyrData["cases"]> } | null>(null);
  const [zephyrModalSearch, setZephyrModalSearch] = useState("");
  const [entqaSprintModal, setEntqaSprintModal] = useState<{
    folder: string;
    groups: Array<{
      sprint: string;
      cases: NonNullable<ZephyrData["cases"]>;
      automated: number;
      pending: number;
      other: number;
      executed: number;
    }>;
  } | null>(null);
  const [expandedZephyrPod, setExpandedZephyrPod] = useState<string | null>(null);
  // QA tab owns its filters: an in-tab pod filter independent from the shared
  // pod/quarter/sprint bar (which is hidden on this tab).
  const [qaPod, setQaPod] = useState("all");
  const [qaMember, setQaMember] = useState("all");
  const [defectPod, setDefectPod] = useState("all");
  const [defectReporterSearch, setDefectReporterSearch] = useState("");
  const [zephyrPersonSearch, setZephyrPersonSearch] = useState("");
  const [selectedZephyrMember, setSelectedZephyrMember] = useState<string | null>(null);
  const [showZephyrPeople, setShowZephyrPeople] = useState(false);
  const [zephyrScope, setZephyrScope] = useState("all");
  const [zephyrQuarter, setZephyrQuarter] = useState("all");
  const [zephyrSprint, setZephyrSprint] = useState("all");
  const [zephyrExecutionStatus, setZephyrExecutionStatus] = useState("all");

  const defectPodKey = (issue: IssueRow) => issue.podName || issue.podKey || issue.projectName || issue.projectKey || "UNKNOWN";
  const defectPods = Array.from(
    new Map(qaDefects.map((issue) => {
      const key = defectPodKey(issue);
      return [key, { key, name: issue.podName || issue.projectName || issue.podKey || issue.projectKey || key }] as const;
    })).values()
  ).sort((a, b) => a.name.localeCompare(b.name));
  const defectScope = qaDefects.filter((issue) =>
    defectPod === "all" || defectPodKey(issue) === defectPod
  );
  const allReporterNames = Array.from(new Set(qaDefects.map((issue) => issue.reporter || "Unassigned")))
    .sort((a, b) => a.localeCompare(b));
  const defectRows = defectScope.filter((issue) =>
    !defectReporterSearch.trim() || (issue.reporter || "Unassigned").toLowerCase().includes(defectReporterSearch.trim().toLowerCase())
  );
  const reporterNames = Array.from(new Set(defectRows.map((issue) => issue.reporter || "Unassigned")))
    .sort((a, b) => a.localeCompare(b));
  const defectColumns = defectPod === "all"
    ? defectPods
    : defectPods.filter((pod) => pod.key === defectPod);
  const defectsFor = (reporter: string, podKey: string) => defectRows.filter((issue) =>
    (issue.reporter || "Unassigned") === reporter && defectPodKey(issue) === podKey
  );
  const scopeAdditionalDefects = (rows?: IssueRow[]) => rows?.filter((issue) =>
    (defectPod === "all" || defectPodKey(issue) === defectPod) &&
    (!defectReporterSearch.trim() || (issue.reporter || "Unassigned").toLowerCase().includes(defectReporterSearch.trim().toLowerCase()))
  );
  const uatDefectRows = scopeAdditionalDefects(qaUatDefects);
  const leakageDefectRows = scopeAdditionalDefects(qaLeakageDefects);
  const uniqueIssues = (rows: IssueRow[]) => Array.from(new Map(rows.map((issue) => [issue.key, issue] as const)).values());
  const isCompletedDefect = (issue: IssueRow) => issue.isDone || /^(done|accepted|released|closed|resolved|completed)$/i.test(issue.status);
  const isCancelledDefect = (issue: IssueRow) => /^(?:cancell?ed|rejected|won't do|wont do)$/i.test(issue.status);
  const defectAnalysisRows = uniqueIssues(defectRows.filter((issue) => /^bug$/i.test(issue.workType)));
  const cancelledDefectRows = defectAnalysisRows.filter(isCancelledDefect);
  const completedDefectRows = defectAnalysisRows.filter((issue) => isCompletedDefect(issue) && !isCancelledDefect(issue));
  const openDefectRows = defectAnalysisRows.filter((issue) => !isCompletedDefect(issue) && !isCancelledDefect(issue));
  const qaDefectCount = defectAnalysisRows.length;
  const scopedUatRows = uniqueIssues(uatDefectRows ?? []).filter((issue) => /^bug$/i.test(issue.workType));
  const scopedLeakageRows = uniqueIssues(leakageDefectRows ?? []).filter((issue) => /^bug$/i.test(issue.workType));
  const defectKeys = new Set(defectAnalysisRows.map((issue) => issue.key));
  const matchedLeakageRows = scopedLeakageRows.filter((issue) => defectKeys.has(issue.key));
  const leakedDefectCount = matchedLeakageRows.length;
  const defectLeakageRate = qaDefectCount ? Math.round((leakedDefectCount / qaDefectCount) * 1000) / 10 : 0;
  const deliveredStoryPoints = qualityItems
    ? qualityItems
        .filter((issue) =>
          (doneStatuses ?? ["Done", "Accepted", "Released", "Closed", "Resolved"]).includes(issue.status) &&
          !/^sub-?task$/i.test(issue.workType) &&
          (defectPod === "all" || (issue.podName || issue.podKey || issue.projectName || issue.projectKey || "UNKNOWN") === defectPod)
        )
        .reduce((total, issue) => total + (issue.storyPoints || 0), 0)
    : issues
        .filter((issue) => issue.isDone && (defectPod === "all" || defectPodKey(issue) === defectPod))
        .reduce((total, issue) => total + (issue.storyPoints || 0), 0);
  const defectDensity = deliveredStoryPoints
    ? Number(((qaDefectCount / deliveredStoryPoints) * 100).toFixed(1))
    : null;
  const additionalPriorities = Array.from(new Set(defectAnalysisRows.map((issue) => issue.priority || "Unspecified")))
    .filter((priority) => !["high", "medium", "low"].includes(priority.toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
  const defectPriorities = ["High", "Medium", "Low", ...additionalPriorities]
    .map((priority) => ({
      priority,
      count: defectAnalysisRows.filter((issue) => (issue.priority || "Unspecified").toLowerCase() === priority.toLowerCase()).length,
      color: /highest|high/i.test(priority) ? "#c03a2b" : /medium/i.test(priority) ? "#f2a900" : /low/i.test(priority) ? "#0052cc" : "#6b778c",
    }));
  const resolutionDenominator = qaDefectCount - cancelledDefectRows.length;
  const defectResolutionRate = resolutionDenominator
    ? Math.round((completedDefectRows.length / resolutionDenominator) * 100)
    : null;
  const open = (title: string, subtitle: string, list: IssueRow[]) =>
    setModal({ title, subtitle, issues: list });

  const resolutionScopeRows = defectAnalysisRows.filter((issue) => !isCancelledDefect(issue));
  const defectMetricCards = [
    { title: "Total Defects", value: qaDefectCount, note: "Distinct Jira bugs in this scope", subtitle: `${qaDefectCount} distinct bugs returned by the configured QA defect query`, rows: defectAnalysisRows, tone: "indigo" },
    { title: "Open Defects", value: openDefectRows.length, note: "Unresolved; includes reopened", subtitle: `${openDefectRows.length} bugs are not completed or canceled`, rows: openDefectRows, tone: "amber" },
    { title: "Closed Defects", value: completedDefectRows.length, note: "Completed, accepted, or resolved", subtitle: `${completedDefectRows.length} bugs have a completed Jira status`, rows: completedDefectRows, tone: "emerald" },
    { title: "Canceled Defects", value: cancelledDefectRows.length, note: "Canceled or rejected statuses", subtitle: `${cancelledDefectRows.length} bugs are canceled or rejected and excluded from the resolution-rate denominator`, rows: cancelledDefectRows, tone: "rose" },
    { title: "Defect Density", value: defectDensity === null ? "N/A" : defectDensity, note: "Bugs per 100 completed story points", subtitle: defectDensity === null ? "Density is unavailable because no completed story points are in scope" : `${qaDefectCount} distinct QA bugs ÷ ${deliveredStoryPoints} completed story points × 100`, rows: defectAnalysisRows, tone: "blue" },
    { title: "UAT Defects", value: qaUatDefects === undefined ? "N/A" : scopedUatRows.length, note: qaUatDefects === undefined ? "Configure the UAT Jira query" : "Distinct bugs from the UAT Jira query", subtitle: qaUatDefects === undefined ? "Configure JIRA_QA_UAT_DEFECT_JQL to enable this analysis" : `${scopedUatRows.length} distinct UAT defects in the selected scope`, rows: scopedUatRows, tone: "sky" },
    { title: "Defect Leakage", value: qaLeakageDefects === undefined ? "N/A" : qaDefectCount ? `${defectLeakageRate}%` : "N/A", note: qaLeakageDefects === undefined ? "Configure the leakage Jira query" : `${leakedDefectCount} matched · ${scopedLeakageRows.length} query results`, subtitle: qaLeakageDefects === undefined ? "Configure JIRA_QA_LEAKAGE_DEFECT_JQL to enable this analysis" : `The leakage query returned ${scopedLeakageRows.length} distinct issues; ${leakedDefectCount} also match the main QA defect query. The rate is ${leakedDefectCount} ÷ ${qaDefectCount} QA defects.`, rows: scopedLeakageRows, tone: "violet" },
    { title: "Defect Resolution Rate", value: defectResolutionRate === null ? "N/A" : `${defectResolutionRate}%`, note: "Closed ÷ non-canceled defects", subtitle: defectResolutionRate === null ? "Resolution rate is unavailable because there are no non-canceled defects in scope" : `${completedDefectRows.length} closed ÷ ${resolutionDenominator} non-canceled defects × 100; canceled defects are excluded`, rows: resolutionScopeRows, tone: "teal" },
  ];

  const toneClasses: Record<string, string> = {
    indigo: "border-indigo-100 text-indigo-700 hover:border-indigo-300",
    amber: "border-amber-100 text-amber-700 hover:border-amber-300",
    emerald: "border-emerald-100 text-emerald-700 hover:border-emerald-300",
    rose: "border-rose-100 text-rose-700 hover:border-rose-300",
    orange: "border-orange-100 text-orange-700 hover:border-orange-300",
    blue: "border-blue-100 text-blue-700 hover:border-blue-300",
    sky: "border-sky-100 text-sky-700 hover:border-sky-300",
    violet: "border-violet-100 text-violet-700 hover:border-violet-300",
    teal: "border-teal-100 text-teal-700 hover:border-teal-300",
  };

  const openMember = (m: QaMemberStat) => {
    const s = sliced(m);
    open(
      `QA Workload · ${m.name}`,
      `${s.assigned} items · ${m.podNames.join(", ") || m.podKeys.join(", ") || "no pod"} · ${s.allocated} of ${m.capacityHours} hrs allocated · ${s.tests} test case${s.tests === 1 ? "" : "s"}`,
      memberIssueRows(m)
    );
  };

  // In-tab pod options derive from the QA members' actual teams.
  const zephyrCases = zephyr?.cases ?? [];
  const openZephyrModal = (title: string, subtitle: string, cases: NonNullable<ZephyrData["cases"]>) => {
    setZephyrModalSearch("");
    setZephyrModal({ title, subtitle, cases });
  };
  const zephyrModalCases = (zephyrModal?.cases ?? []).filter((testCase) => {
    const query = zephyrModalSearch.trim().toLowerCase();
    if (!query) return true;
    return [
      testCase.key, testCase.name, testCase.projectKey, testCase.projectName,
      testCase.ownerName, testCase.status, testCase.priority, testCase.folder,
      ...testCase.podNames, ...(testCase.sprints ?? []), ...testCase.linkedIssueKeys,
      ...testCase.labels,
      ...testCase.executions.flatMap((execution) => [execution.status, execution.assignedTo, execution.executedBy, execution.cycle]),
    ].some((value) => String(value || "").toLowerCase().includes(query));
  });
  const zephyrProjects = Array.from(new Map(zephyrCases.map((testCase) => [testCase.projectKey, { key: testCase.projectKey, name: testCase.projectName }])).values()).sort((a, b) => a.name.localeCompare(b.name));
  const zephyrPodOptions = Array.from(new Set(zephyrCases.flatMap((testCase) => testCase.podNames))).sort((a, b) => a.localeCompare(b));
  const zephyrScopeOptions = (() => {
    const options = new Map<string, { value: string; label: string; podNames: string[]; projectKeys: string[] }>();
    for (const pod of zephyrPodOptions) {
      const normalized = pod.trim().toLowerCase();
      options.set(`name:${normalized}`, { value: `scope:${normalized}`, label: pod, podNames: [pod], projectKeys: [] });
    }
    for (const project of zephyrProjects) {
      const normalizedName = project.name.trim().toLowerCase();
      const existing = options.get(`name:${normalizedName}`);
      if (existing) {
        existing.projectKeys.push(project.key);
        existing.label = `${project.name} (${existing.projectKeys.join(", ")})`;
      } else {
        options.set(`project:${project.key.toLowerCase()}`, {
          value: `scope:project:${project.key.toLowerCase()}`,
          label: `${project.name} (${project.key})`,
          podNames: [],
          projectKeys: [project.key],
        });
      }
    }
    return Array.from(options.values()).sort((a, b) => a.label.localeCompare(b.label));
  })();
  const selectedZephyrScope = zephyrScopeOptions.find((option) => option.value === zephyrScope);
  const quarterFromZephyrSprint = (sprint: string) => {
    const pi = sprint.match(/CY(\d{2})\s*PI\.?\s*(\d)/i);
    if (pi) return `CY${pi[1]} PI.${Number(pi[2])}`;
    const yearQuarter = sprint.match(/(\d{4})\s*-?\s*Q\s*([1-4])/i);
    if (yearQuarter) return `CY${yearQuarter[1].slice(-2)} PI.${Number(yearQuarter[2])}`;
    return "Other / unclassified";
  };
  const scopeCasesForZephyrFilters = zephyrCases.filter((testCase) => {
    if (zephyrScope === "all") return true;
    return Boolean(selectedZephyrScope && (
      selectedZephyrScope.podNames.some((pod) => testCase.podNames.includes(pod)) ||
      selectedZephyrScope.projectKeys.some((key) => testCase.projectKey.toLowerCase() === key.toLowerCase())
    ));
  });
  const quarterOptions = Array.from(new Set(scopeCasesForZephyrFilters.flatMap((testCase) => testCase.sprints ?? []).map(quarterFromZephyrSprint)))
    .sort((a, b) => {
      if (a === "Other / unclassified") return 1;
      if (b === "Other / unclassified") return -1;
      const [, ay = "0", aq = "0"] = a.match(/^CY(\d{2}) PI\.(\d+)$/) ?? [];
      const [, by = "0", bq = "0"] = b.match(/^CY(\d{2}) PI\.(\d+)$/) ?? [];
      return Number(ay) - Number(by) || Number(aq) - Number(bq);
    });
  const quarterScopedZephyrCases = scopeCasesForZephyrFilters.filter((testCase) => zephyrQuarter === "all" || (testCase.sprints ?? []).some((sprint) => quarterFromZephyrSprint(sprint) === zephyrQuarter));
  const zephyrSprintOptions = Array.from(new Set(quarterScopedZephyrCases.flatMap((testCase) => testCase.sprints ?? []))).sort((a, b) => a.localeCompare(b));
  const qaPodOptions = Array.from(new Set([
    ...(qaCapacity?.members ?? []).flatMap((m) => m.podNames),
    ...zephyrCases.flatMap((testCase) => testCase.podNames),
  ])).sort((a, b) => a.localeCompare(b));

  const sliceMember = (m: QaMemberStat) => {
    if (qaPod === "all") return { allocated: m.allocatedHours, supported: m.supportedHours, available: m.availableHours, tests: m.testCases, openTests: m.openTestCases, assigned: m.assignedIssues };
    const selectedPodKeys = new Set(m.podKeys.filter((key, index) => key === qaPod || m.podNames[index] === qaPod));
    const totalHoursByPod = m.hoursByPod ?? {};
    const supByPod = m.supportByPod ?? {};
    const tesByPod = m.testsByPod ?? {};
    const openTesByPod = m.openTestsByPod ?? {};
    const issByPod = m.issuesByPod ?? {};
    const keys = new Set([...Object.keys(totalHoursByPod), ...Object.keys(supByPod), ...Object.keys(tesByPod), ...Object.keys(openTesByPod), ...Object.keys(issByPod)]);
    const matchingKeys = Array.from(keys).filter((key) => selectedPodKeys.has(key));
    const sumForPod = (map: Record<string, number>) => matchingKeys.reduce((total, key) => total + (map[key] ?? 0), 0);
    const supported = sumForPod(supByPod);
    const allocated = Math.max(0, Math.round((sumForPod(totalHoursByPod) - supported) * 10) / 10);
    const load = Math.round((allocated + supported) * 10) / 10;
    return {
      allocated,
      supported,
      available: Math.round(Math.max(0, (m.capacityHours ?? 0) - load) * 10) / 10,
      tests: sumForPod(tesByPod),
      openTests: sumForPod(openTesByPod),
      assigned: sumForPod(issByPod),
    };
  };

  // Cards, filters, pod/sprint summaries, and their popups all use the same
  // latest execution outcome. A case with no execution is counted as pending.
  const latestExecutionCategory = (testCase: (typeof zephyrCases)[number]) =>
    testCase.latestExecution?.statusCategory ?? "pending";
  const scopedZephyrCases = zephyrCases.filter((testCase) => {
    const scopeMatch = zephyrScope === "all" || Boolean(selectedZephyrScope && (
      selectedZephyrScope.podNames.some((pod) => testCase.podNames.includes(pod)) ||
      selectedZephyrScope.projectKeys.some((key) => testCase.projectKey.toLowerCase() === key.toLowerCase())
    ));
    const quarterMatch = zephyrQuarter === "all" || (testCase.sprints ?? []).some((sprint) => quarterFromZephyrSprint(sprint) === zephyrQuarter);
    const sprintMatch = zephyrSprint === "all" || (zephyrSprint === "__no_sprint__" ? !(testCase.sprints?.length) : (testCase.sprints ?? []).includes(zephyrSprint));
    const executionMatch = zephyrExecutionStatus === "all" || latestExecutionCategory(testCase) === zephyrExecutionStatus;
    return scopeMatch && quarterMatch && sprintMatch && executionMatch;
  });
  const qaRoster = qaCapacity?.members ?? [];
  const normalizePerson = (name: string) => name.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const zephyrPeopleOptions = qaRoster.filter((member) =>
    !zephyrPersonSearch.trim() || [member.name, ...(member.aliasNames ?? [])]
      .some((name) => name.toLocaleLowerCase().includes(zephyrPersonSearch.trim().toLocaleLowerCase()))
  ).sort((a, b) => a.name.localeCompare(b.name));
  const activeZephyrMember = qaRoster.find((member) => member.name === selectedZephyrMember) ?? null;
  const activeMemberAliases = activeZephyrMember
    ? new Set([activeZephyrMember.name, ...(activeZephyrMember.aliasNames ?? [])].map(normalizePerson))
    : new Set<string>();
  const activeMemberCases = activeZephyrMember ? scopedZephyrCases.filter((testCase) =>
    activeMemberAliases.has(normalizePerson(testCase.ownerName)) || testCase.executions.some((execution) =>
      activeMemberAliases.has(normalizePerson(execution.assignedTo)) || activeMemberAliases.has(normalizePerson(execution.executedBy))
    )
  ) : [];
  const activeMemberCounts = activeMemberCases.reduce((counts, testCase) => {
    const category = latestExecutionCategory(testCase);
    counts[category] = (counts[category] ?? 0) + 1;
    return counts;
  }, {} as Record<string, number>);
  const activeMemberCompletedCount = (activeMemberCounts.passed ?? 0) + (activeMemberCounts.failed ?? 0) + (activeMemberCounts.blocked ?? 0);
  const activeMemberPodGroups = Array.from(new Set(activeMemberCases.flatMap((testCase) => testCase.podNames.length ? testCase.podNames : ["Unmapped pod"])))
    .sort((a, b) => a.localeCompare(b))
    .map((pod) => ({ pod, cases: activeMemberCases.filter((testCase) => testCase.podNames.includes(pod) || (!testCase.podNames.length && pod === "Unmapped pod")) }));
  const executionCounts = (cases: typeof zephyrCases) => cases.reduce((counts, testCase) => {
    const status = latestExecutionCategory(testCase);
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {} as Record<string, number>);
  const scopedExecutionCounts = executionCounts(scopedZephyrCases);
  const showEntqaAutomationStatus = selectedZephyrScope?.projectKeys.some((key) => key.toUpperCase() === "ENTQA") ?? false;
  const entqaFolderStatusGroups = (() => {
    if (!showEntqaAutomationStatus) return [];
    const folders = new Map<string, (typeof scopedZephyrCases)[number][]>();
    for (const testCase of scopedZephyrCases.filter((item) => item.projectKey.toUpperCase() === "ENTQA")) {
      const folder = testCase.folder && !/^unfiled$/i.test(testCase.folder) ? testCase.folder : "Unfiled";
      folders.set(folder, [...(folders.get(folder) ?? []), testCase]);
    }
    return Array.from(folders, ([folder, cases]) => {
      const automated = cases.filter((testCase) => /^approved$/i.test(testCase.status));
      const pending = cases.filter((testCase) => /^draft$/i.test(testCase.status));
      return { folder, cases, total: cases.length, automated, pending, other: cases.filter((testCase) => !/^(approved|draft)$/i.test(testCase.status)) };
    }).sort((a, b) => a.folder.localeCompare(b.folder));
  })();
  const openEntqaSprintModal = (folder: string, cases: NonNullable<ZephyrData["cases"]>) => {
    const bySprint = new Map<string, Map<string, (typeof cases)[number]>>();
    for (const testCase of cases) {
      const sprints = testCase.sprints?.length ? testCase.sprints : ["No linked Jira sprint"];
      for (const sprint of sprints) {
        const sprintCases = bySprint.get(sprint) ?? new Map<string, (typeof cases)[number]>();
        sprintCases.set(testCase.key, testCase);
        bySprint.set(sprint, sprintCases);
      }
    }
    const groups = Array.from(bySprint, ([sprint, testCaseMap]) => {
      const sprintCases = Array.from(testCaseMap.values());
      const automated = sprintCases.filter((testCase) => /^approved$/i.test(testCase.status)).length;
      const pending = sprintCases.filter((testCase) => /^draft$/i.test(testCase.status)).length;
      return {
        sprint,
        cases: sprintCases,
        automated,
        pending,
        other: sprintCases.length - automated - pending,
        executed: sprintCases.filter((testCase) => testCase.executionCount > 0).length,
      };
    }).sort((a, b) => {
      if (a.sprint === "No linked Jira sprint") return 1;
      if (b.sprint === "No linked Jira sprint") return -1;
      return a.sprint.localeCompare(b.sprint);
    });
    setEntqaSprintModal({ folder, groups });
  };
  const podSprintPerformance = (() => {
    const groups = new Map<string, { pod: string; sprint: string; cases: Map<string, (typeof scopedZephyrCases)[number]> }>();
    for (const testCase of scopedZephyrCases) {
      const pods = testCase.podNames.length ? testCase.podNames : ["Unmapped pod"];
      const sprints = testCase.sprints?.length ? testCase.sprints : ["No linked Jira sprint"];
      for (const pod of pods) for (const sprint of sprints) {
        const key = `${pod}\u0000${sprint}`;
        if (!groups.has(key)) groups.set(key, { pod, sprint, cases: new Map() });
        groups.get(key)!.cases.set(testCase.key, testCase);
      }
    }
    return Array.from(groups.values()).map((group) => {
      const cases = Array.from(group.cases.values());
      const count = (category: string) => cases.filter((testCase) => latestExecutionCategory(testCase) === category).length;
      const passed = count("passed");
      const executed = cases.filter((testCase) => testCase.executionCount > 0).length;
      return { ...group, cases, total: cases.length, executed, passed, failed: count("failed"), blocked: count("blocked"), inProgress: count("in-progress"), pending: count("pending"), passRate: executed ? Math.round((passed / executed) * 100) : null };
    }).sort((a, b) => a.pod.localeCompare(b.pod) || a.sprint.localeCompare(b.sprint));
  })();
  const scopedCasesWithSprint = scopedZephyrCases.filter((testCase) => testCase.sprints?.length).length;
  const sprintCoveragePercent = scopedZephyrCases.length
    ? Math.round((scopedCasesWithSprint / scopedZephyrCases.length) * 100)
    : 0;
  const zephyrPodPerformance = (() => {
    const byPod = new Map<string, Map<string, (typeof scopedZephyrCases)[number]>>();
    for (const testCase of scopedZephyrCases) {
      const pods = testCase.podNames.length ? testCase.podNames : ["Unmapped pod"];
      for (const pod of pods) {
        const cases = byPod.get(pod) ?? new Map<string, (typeof scopedZephyrCases)[number]>();
        cases.set(testCase.key, testCase);
        byPod.set(pod, cases);
      }
    }
    return Array.from(byPod, ([pod, caseMap]) => {
      const cases = Array.from(caseMap.values());
      const executed = cases.filter((testCase) => testCase.executionCount > 0).length;
      const passed = cases.filter((testCase) => latestExecutionCategory(testCase) === "passed").length;
      return {
        pod,
        cases,
        total: cases.length,
        executed,
        passed,
        failed: cases.filter((testCase) => latestExecutionCategory(testCase) === "failed").length,
        blocked: cases.filter((testCase) => latestExecutionCategory(testCase) === "blocked").length,
        inProgress: cases.filter((testCase) => latestExecutionCategory(testCase) === "in-progress").length,
        pending: cases.filter((testCase) => latestExecutionCategory(testCase) === "pending").length,
        withSprint: cases.filter((testCase) => testCase.sprints?.length).length,
        sprintRows: podSprintPerformance.filter((row) => row.pod === pod),
        progress: cases.length ? Math.round((executed / cases.length) * 100) : 0,
        passRate: executed ? Math.round((passed / executed) * 100) : null,
      };
    }).sort((a, b) => a.pod.localeCompare(b.pod));
  })();

  const sliced = (m: QaMemberStat) => sliceMember(m);
  const qaVisibleMembers = (qaCapacity?.members ?? []).filter((member) =>
    qaPod === "all" || member.podNames.includes(qaPod) || member.podKeys.includes(qaPod) ||
      zephyrCases.some((testCase) => (testCase.ownerName === member.name || (member.aliasNames ?? []).includes(testCase.ownerName)) && testCase.podNames.includes(qaPod))
  ).filter((member) => qaMember === "all" || member.name === qaMember || (member.aliasNames ?? []).includes(qaMember));
  const qaScopeTotals = qaVisibleMembers.reduce((totals, member) => {
    const slice = sliced(member);
    totals.capacity += member.capacityHours;
    totals.allocated += slice.allocated;
    totals.supported += slice.supported;
    totals.available += slice.available;
    return totals;
  }, { capacity: 0, allocated: 0, supported: 0, available: 0 });

  const memberIssueRows = (m: QaMemberStat) =>
    issues.filter((i) => new Set([m.name, ...(m.aliasNames ?? [])]).has(i.assignee));

  // Utilization bar color: green under 70% load, amber 70-100, red over.
  const loadColor = (pct: number) =>
    pct <= 70
      ? "bg-jira-green"
      : pct <= 100
      ? "bg-jira-amber"
      : "bg-jira-red";
  const memberUtilisation = (member: QaMemberStat) => {
    const current = sliced(member);
    const load = current.allocated + current.supported;
    return member.capacityHours > 0 ? Math.min(200, Math.round((load / member.capacityHours) * 100)) : 0;
  };

  return (
    <div className="space-y-6">
      {/* ---- QA defects ---- */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5">
        <div className="border-b border-slate-200 bg-white px-5 py-5 sm:px-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-bold tracking-tight text-slate-900">QA Defects</h2>
                <span className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">{qaDefectCount} bugs</span>
              </div>
              <p className="mt-1.5 max-w-2xl text-sm text-slate-500">Track defect status and reporter ownership across QA pods. Select a count to inspect the matching Jira issues.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative block min-w-0 sm:w-72">
                <span className="sr-only">Search QA reporter by name</span>
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.6"/><path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                <input
                  list="qa-reporter-name-options"
                  value={defectReporterSearch}
                  onChange={(event) => setDefectReporterSearch(event.target.value)}
                  placeholder="Search reporter by name"
                  aria-label="Search QA reporter by name"
                  className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
                <datalist id="qa-reporter-name-options">
                  {allReporterNames.map((name) => <option key={name} value={name} />)}
                </datalist>
              </label>
              <label className="block sm:w-56">
                <span className="sr-only">Filter defects by pod</span>
                <select
                  value={defectPod}
                  onChange={(event) => setDefectPod(event.target.value)}
                  aria-label="Filter QA defects by pod"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="all">All pods</option>
                  {defectPods.map((pod) => <option key={pod.key} value={pod.key}>{pod.name}</option>)}
                </select>
              </label>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5 sm:px-7">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Defect metrics</h3>
            <p className="mt-0.5 text-[11px] text-slate-500">Select any metric for its definition and matching Jira defects · filtered by pod and reporter search</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">{defectPod === "all" ? "All pods" : defectPods.find((pod) => pod.key === defectPod)?.name ?? defectPod}</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5 border-b border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-4 sm:gap-3 sm:p-5">
          {defectMetricCards.map((card) => (
            <button
              key={card.title}
              type="button"
              onClick={() => open(card.title, card.subtitle, card.rows)}
              aria-label={`${card.title}: ${card.value}. ${card.note}. Click to open details.`}
              className={`rounded-xl border bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 sm:p-3.5 ${toneClasses[card.tone]}`}
            >
              <p className="text-[9px] font-bold uppercase leading-4 tracking-[0.1em] sm:text-[10px]">{card.title}</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-[1.7rem]">{card.value}</p>
              <p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-slate-500 sm:text-[11px]">{card.note}</p>
            </button>
          ))}
        </div>

        {qaDefects.length === 0 ? (
          <div className="px-5 py-12 text-center sm:px-7">
            <p className="text-sm font-semibold text-slate-800">No defects found</p>
            <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-slate-500">Check the Jira query and the API account’s project access. The defect filter is configured with <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">JIRA_QA_DEFECT_JQL</code>.</p>
          </div>
        ) : defectRows.length === 0 ? (
          <div className="px-5 py-12 text-center sm:px-7">
            <p className="text-sm font-semibold text-slate-800">No reporters match “{defectReporterSearch}”</p>
            <button type="button" onClick={() => setDefectReporterSearch("")} className="mt-2 text-xs font-semibold text-indigo-700 hover:text-indigo-900">Clear reporter search</button>
          </div>
        ) : (
          <div className="p-5 pt-0 sm:px-7 sm:pb-7">
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="flex flex-col gap-1 border-b border-slate-200 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Reported Defects by Pod</h3>
                  <p className="mt-0.5 text-[11px] text-slate-500">Names are Jira reporters · click a count to view those defects</p>
                </div>
                <p className="text-[10px] text-slate-400">{fetchedAt ? `Updated ${new Date(fetchedAt).toLocaleString()}` : "Live Jira data"}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="bg-white text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <tr><th className="sticky left-0 z-10 bg-white px-4 py-3">Reporter</th>{defectColumns.map((pod) => <th key={pod.key} className="px-4 py-3 text-center">{pod.name}</th>)}<th className="px-4 py-3 text-center">Total</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reporterNames.map((reporter) => {
                      const rowIssues = defectRows.filter((issue) => (issue.reporter || "Unassigned") === reporter);
                      return <tr key={reporter} className="transition hover:bg-indigo-50/40">
                        <th className="sticky left-0 bg-white px-4 py-3 text-left font-semibold text-slate-800"><span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-blue-100 text-[10px] font-bold text-indigo-800">{reporter.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><span className="ml-2.5 align-middle">{reporter}</span></th>
                        {defectColumns.map((pod) => {
                          const cellIssues = defectsFor(reporter, pod.key);
                          return <td key={pod.key} className="px-4 py-2 text-center"><button type="button" disabled={!cellIssues.length} onClick={() => open(`${reporter} · ${pod.name}`, `${cellIssues.length} reported defects`, cellIssues)} className={`min-w-9 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${cellIssues.length ? "bg-indigo-50 text-indigo-700 hover:bg-indigo-100" : "text-slate-300"}`}>{cellIssues.length}</button></td>;
                        })}
                        <td className="px-4 py-2 text-center"><button type="button" onClick={() => open(`${reporter} · All Pods`, `${rowIssues.length} reported defects`, rowIssues)} className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 transition hover:bg-slate-100">{rowIssues.length}</button></td>
                      </tr>;
                    })}
                    <tr className="bg-slate-50 font-bold text-slate-800"><th className="sticky left-0 bg-slate-50 px-4 py-3 text-left">Total issues</th>{defectColumns.map((pod) => { const podRows = defectRows.filter((issue) => defectPodKey(issue) === pod.key); return <td key={pod.key} className="px-4 py-2 text-center"><button type="button" onClick={() => open(`${pod.name} · QA Defects`, `${podRows.length} defects in pod`, podRows)} className="rounded-lg px-2.5 py-1.5 text-xs font-bold hover:bg-white">{podRows.length}</button></td>; })}<td className="px-4 py-2 text-center text-xs">{defectRows.length}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        <div className="border-t border-slate-200 p-5 sm:p-7">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-900">Defect Severity &amp; Priority Distribution</h3>
            <p className="mt-1 text-[11px] text-slate-500">Grouped by Jira priority. The current issue feed does not map a separate severity field.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {defectPriorities.map((pd) => {
              const priorityRows = defectAnalysisRows.filter((issue) => (issue.priority || "Unspecified").toLowerCase() === pd.priority.toLowerCase());
              return (
                <button
                  key={pd.priority}
                  type="button"
                  onClick={() => open(`${pd.priority} Priority`, `${pd.count} QA defects with ${pd.priority.toLowerCase()} Jira priority`, priorityRows)}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-indigo-300 hover:bg-white hover:shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: pd.color }} />
                      {pd.priority}
                    </span>
                    <span className="text-lg font-bold" style={{ color: pd.color }}>{pd.count}</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Matching Jira defects · click to inspect</p>
                </button>
              );
            })}
          </div>
        </div>

      </section>

      {/* ---- Zephyr test case portfolio ---- */}
      {zephyr?.available && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Zephyr test cases</h2>
                <p className="mt-1 text-sm text-slate-500">Explore execution progress by pod and sprint. Select a metric or table row to inspect its cases.</p>
              </div>
              <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">
                {scopedZephyrCases.length} matching cases · {scopedZephyrCases.reduce((total, testCase) => total + testCase.executionCount, 0)} runs
              </span>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              <div className="relative xl:col-span-2">
                <label htmlFor="zephyr-people-search" className="sr-only">Search people</label>
                <input
                  id="zephyr-people-search"
                  value={zephyrPersonSearch}
                  onChange={(event) => { setZephyrPersonSearch(event.target.value); setSelectedZephyrMember(null); setShowZephyrPeople(true); }}
                  onFocus={() => setShowZephyrPeople(true)}
                  onBlur={() => window.setTimeout(() => setShowZephyrPeople(false), 120)}
                  placeholder="Search people"
                  aria-label="Search people"
                  aria-expanded={showZephyrPeople}
                  aria-controls="zephyr-people-options"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
                {showZephyrPeople && (
                  <div id="zephyr-people-options" role="listbox" aria-label="QA members" className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                    {zephyrPeopleOptions.length ? zephyrPeopleOptions.map((member) => (
                      <button
                        key={member.name}
                        type="button"
                        role="option"
                        aria-selected={selectedZephyrMember === member.name}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => { setSelectedZephyrMember(member.name); setZephyrPersonSearch(""); setShowZephyrPeople(false); }}
                        className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
                      >
                        <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-800">{member.name}</span><span className="block truncate text-[11px] text-slate-500">{member.podNames.join(" · ") || "QA team member"}</span></span>
                        <span className="shrink-0 text-[10px] font-semibold text-indigo-700">View activity</span>
                      </button>
                    )) : <p className="px-3 py-4 text-center text-xs text-slate-500">No QA members match that search.</p>}
                  </div>
                )}
              </div>
              <select value={zephyrScope} onChange={(event) => { setZephyrScope(event.target.value); setZephyrQuarter("all"); setZephyrSprint("all"); }} aria-label="Filter by QA pod or project" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"><option value="all">All pods</option>{zephyrScopeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
              <select value={zephyrQuarter} onChange={(event) => { setZephyrQuarter(event.target.value); setZephyrSprint("all"); }} aria-label="Filter by quarter or program increment" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"><option value="all">All quarters / PIs</option>{quarterOptions.map((quarter) => <option key={quarter} value={quarter}>{quarter}</option>)}</select>
              <select value={zephyrSprint} onChange={(event) => setZephyrSprint(event.target.value)} aria-label="Filter by Jira sprint" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"><option value="all">All sprints</option>{zephyrSprintOptions.map((sprint) => <option key={sprint} value={sprint}>{sprint}</option>)}<option value="__no_sprint__">No linked Jira sprint</option></select>
              <select value={zephyrExecutionStatus} onChange={(event) => setZephyrExecutionStatus(event.target.value)} aria-label="Filter by execution status" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"><option value="all">All execution statuses</option><option value="passed">Passed</option><option value="failed">Failed</option><option value="blocked">Blocked</option><option value="in-progress">In progress</option><option value="pending">Not run yet</option></select>
            </div>
            {selectedZephyrMember && activeZephyrMember && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2.5">
                <p className="min-w-0 text-xs text-slate-700"><span className="font-bold text-slate-900">Viewing {activeZephyrMember.name}</span><span className="mx-1.5 text-slate-300">·</span>{activeZephyrMember.podNames.join(", ") || "QA team member"}</p>
                <button type="button" onClick={() => setSelectedZephyrMember(null)} className="rounded-md px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-white">Clear person</button>
              </div>
            )}
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-700">Sprint coverage</span>
                <span className="text-slate-600"><b className="text-slate-900">{scopedCasesWithSprint}</b> of {scopedZephyrCases.length} cases linked to a sprint <span className="mx-1 text-slate-300">·</span> {scopedZephyrCases.length - scopedCasesWithSprint} with no linked Jira sprint</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Cases linked to a Jira sprint" aria-valuemin={0} aria-valuemax={100} aria-valuenow={sprintCoveragePercent}>
                <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${sprintCoveragePercent}%` }} />
              </div>
              {scopedCasesWithSprint < scopedZephyrCases.length && <p className="mt-2 text-[11px] leading-4 text-slate-500">“No linked Jira sprint” means no readable Jira Sprint was found on the test case or its Traceability-linked work item.</p>}
            </div>
          </div>
          {activeZephyrMember && (
            <section className="border-t border-slate-200 bg-white px-4 py-4 sm:px-6">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                <div><h3 className="text-sm font-bold text-slate-900">{activeZephyrMember.name} · QA activity</h3><p className="mt-1 text-xs text-slate-500">Cases owned, assigned, or executed by this person in the selected pod, quarter, sprint, and status. Completed counts cases whose latest result is passed, failed, or blocked.</p></div>
                <span className="text-[11px] text-slate-500">{activeMemberCases.length} matching test cases</span>
              </div>
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                {[
                  { label: "Completed", count: activeMemberCompletedCount, color: "text-indigo-700" },
                  { label: "Passed", count: activeMemberCounts.passed ?? 0, color: "text-emerald-700" },
                  { label: "Failed", count: activeMemberCounts.failed ?? 0, color: "text-rose-700" },
                  { label: "Blocked", count: activeMemberCounts.blocked ?? 0, color: "text-amber-700" },
                  { label: "In progress", count: activeMemberCounts["in-progress"] ?? 0, color: "text-sky-700" },
                  { label: "Not run yet", count: activeMemberCounts.pending ?? 0, color: "text-slate-700" },
                ].map((item) => <div key={item.label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><p className="text-[10px] font-semibold text-slate-500">{item.label}</p><p className={`mt-0.5 text-lg font-bold ${item.color}`}>{item.count}</p></div>)}
              </div>
              {activeMemberPodGroups.length ? <div className="space-y-3">
                {activeMemberPodGroups.map(({ pod, cases }) => (
                  <div key={pod} className="overflow-hidden rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between gap-2 bg-slate-50 px-3 py-2.5"><h4 className="text-xs font-bold text-slate-800">{pod}</h4><span className="text-[10px] text-slate-500">{cases.length} cases</span></div>
                    <div className="divide-y divide-slate-100">
                      {cases.map((testCase) => (
                        <button key={testCase.key} type="button" onClick={() => openZephyrModal(`${activeZephyrMember.name} · ${testCase.key}`, `${pod} · ${(testCase.sprints ?? []).join(", ") || "No linked Jira sprint"} · ${testCase.latestExecution?.status ?? "Not run yet"}`, [testCase])} className="grid w-full gap-1 px-3 py-2.5 text-left transition hover:bg-indigo-50/50 sm:grid-cols-[minmax(0,1fr)_minmax(130px,0.8fr)_110px] sm:items-center">
                          <span className="min-w-0"><span className="block truncate text-xs font-semibold text-indigo-700">{testCase.key}</span><span className="block truncate text-xs text-slate-700">{testCase.name}</span></span>
                          <span className="truncate text-[11px] text-slate-500">{(testCase.sprints ?? []).join(", ") || "No linked Jira sprint"}</span>
                          <span className="text-[11px] font-semibold text-slate-700">{testCase.latestExecution?.status ?? "Not run yet"}<span className="ml-1 text-slate-400">· {testCase.executionCount} runs</span></span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div> : <p className="rounded-xl border border-dashed border-slate-300 px-4 py-7 text-center text-sm text-slate-500">No Zephyr cases match this QA member and the selected filters.</p>}
            </section>
          )}
          <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6 sm:p-5">
            {[
              { label: "Total test cases", value: scopedZephyrCases.length, category: "all", color: "text-indigo-700" },
              { label: "Passed", value: scopedExecutionCounts.passed ?? 0, category: "passed", color: "text-emerald-700" },
              { label: "Failed", value: scopedExecutionCounts.failed ?? 0, category: "failed", color: "text-rose-700" },
              { label: "Blocked", value: scopedExecutionCounts.blocked ?? 0, category: "blocked", color: "text-amber-700" },
              { label: "In progress", value: scopedExecutionCounts["in-progress"] ?? 0, category: "in-progress", color: "text-sky-700" },
              { label: "Not run yet", value: scopedExecutionCounts.pending ?? 0, category: "pending", color: "text-slate-700" },
            ].map((card) => {
              const matchingCases = card.category === "all" ? scopedZephyrCases
                : scopedZephyrCases.filter((testCase) => latestExecutionCategory(testCase) === card.category);
              return (
                <button key={card.label} type="button" onClick={() => openZephyrModal(card.label, `${matchingCases.length} matching test cases in the selected filters`, matchingCases)} className="rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-300">
                  <p className={`text-[10px] font-bold uppercase tracking-wide ${card.color}`}>{card.label}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{card.value}</p>
                  <p className="mt-1 text-[10px] text-slate-500">Click to view cases</p>
                </button>
              );
            })}
          </div>
          {showEntqaAutomationStatus && (
            <div className="border-t border-slate-200 bg-white px-4 py-4 sm:px-6">
              <div className="mb-4">
                <h3 className="text-sm font-bold text-slate-900">ENTQA automation by pod</h3>
                <p className="mt-1 text-xs text-slate-500">Grouped by Zephyr folder (for example, SRG, Finance_ERP, DTP, DTR, and Platform_SF). Select a pod to see its sprint breakdown. Approved = Automated · Draft = Pending.</p>
              </div>
              {entqaFolderStatusGroups.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 px-4 py-7 text-center text-sm text-slate-500">No ENTQA test cases match the current filters.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {entqaFolderStatusGroups.map((group) => {
                    const automatedPercent = group.total ? (group.automated.length / group.total) * 100 : 0;
                    const pendingPercent = group.total ? (group.pending.length / group.total) * 100 : 0;
                    const otherPercent = group.total ? (group.other.length / group.total) * 100 : 0;
                    return (
                      <article key={group.folder} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <button type="button" onClick={() => openEntqaSprintModal(group.folder, group.cases)} className="truncate text-left text-sm font-bold text-slate-900 hover:text-indigo-700">{group.folder}</button>
                            <p className="mt-0.5 text-xs text-slate-500">{group.total} total test cases</p>
                          </div>
                          <button type="button" onClick={() => openEntqaSprintModal(group.folder, group.cases)} className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50">Sprint breakdown</button>
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <button type="button" onClick={() => openZephyrModal(`ENTQA · ${group.folder} · Automated`, `${group.automated.length} Approved test cases`, group.automated)} className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-2 text-left transition hover:bg-emerald-100">
                            <p className="text-[10px] font-semibold text-emerald-800">Automated</p><p className="mt-1 text-lg font-bold leading-none text-emerald-900">{group.automated.length}</p>
                          </button>
                          <button type="button" onClick={() => openZephyrModal(`ENTQA · ${group.folder} · Pending`, `${group.pending.length} Draft test cases`, group.pending)} className="rounded-lg border border-amber-100 bg-amber-50/70 p-2 text-left transition hover:bg-amber-100">
                            <p className="text-[10px] font-semibold text-amber-800">Pending</p><p className="mt-1 text-lg font-bold leading-none text-amber-900">{group.pending.length}</p>
                          </button>
                          <button type="button" onClick={() => openZephyrModal(`ENTQA · ${group.folder} · Other statuses`, `${group.other.length} test cases in other Zephyr statuses`, group.other)} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-left transition hover:bg-slate-100">
                            <p className="text-[10px] font-semibold text-slate-600">Other</p><p className="mt-1 text-lg font-bold leading-none text-slate-800">{group.other.length}</p>
                          </button>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${group.automated.length} automated, ${group.pending.length} pending, ${group.other.length} other out of ${group.total} cases`}>
                          <div className="flex h-full w-full">
                            <span className="h-full bg-emerald-500" style={{ width: `${automatedPercent}%` }} />
                            <span className="h-full bg-amber-400" style={{ width: `${pendingPercent}%` }} />
                            <span className="h-full bg-slate-300" style={{ width: `${otherPercent}%` }} />
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {entqaSprintModal && (
            <DetailModal
              title={`ENTQA · ${entqaSprintModal.folder} · Sprint breakdown`}
              subtitle={`${entqaSprintModal.groups.length} sprint groups · choose a sprint to inspect its cases`}
              onClose={() => setEntqaSprintModal(null)}
              wide
            >
              <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
                {entqaSprintModal.groups.map((group) => (
                  <button
                    key={group.sprint}
                    type="button"
                    onClick={() => {
                      setEntqaSprintModal(null);
                      openZephyrModal(`ENTQA · ${entqaSprintModal.folder} · ${group.sprint}`, `${group.cases.length} test cases · ${group.executed} executed`, group.cases);
                    }}
                    className="rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-indigo-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-bold leading-5 text-slate-900">{group.sprint}</h4>
                      <span className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-bold text-indigo-700">{group.cases.length} cases</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{group.executed} executed</p>
                    <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
                      <div><p className="text-[10px] text-slate-500">Automated</p><p className="text-sm font-bold text-emerald-700">{group.automated}</p></div>
                      <div><p className="text-[10px] text-slate-500">Pending</p><p className="text-sm font-bold text-amber-700">{group.pending}</p></div>
                      <div><p className="text-[10px] text-slate-500">Other</p><p className="text-sm font-bold text-slate-700">{group.other}</p></div>
                    </div>
                    <p className="mt-3 text-[10px] font-semibold text-indigo-700">Open test cases →</p>
                  </button>
                ))}
              </div>
            </DetailModal>
          )}
          <div className="border-t border-slate-200 px-4 py-4 sm:px-6">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div><h3 className="text-sm font-bold text-slate-900">Execution by pod and sprint</h3><p className="mt-1 text-xs text-slate-500">Open a pod, then select a sprint to view its cases. Each case uses its latest run; sprint rows can overlap when linked to multiple sprints.</p></div>
              <span className="text-[11px] text-slate-500">{zephyrPodPerformance.length} pods · {podSprintPerformance.length} sprint groups</span>
            </div>
            {zephyrPodPerformance.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">No cases match these filters.</p> : (
              <div className="space-y-2.5">
                {zephyrPodPerformance.map((pod) => {
                  const isExpanded = expandedZephyrPod === pod.pod;
                  return (
                    <section key={pod.pod} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <button type="button" aria-expanded={isExpanded} onClick={() => setExpandedZephyrPod(isExpanded ? null : pod.pod)} className="w-full px-4 py-3.5 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400 sm:px-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition ${isExpanded ? "rotate-90 bg-indigo-50 text-indigo-700" : "bg-slate-100"}`} aria-hidden="true">›</span>
                            <div className="min-w-0"><h4 className="truncate text-sm font-bold text-slate-900">{pod.pod}</h4><p className="mt-0.5 text-[11px] text-slate-500">{pod.total} test cases · {pod.withSprint} assigned to a sprint · {pod.total - pod.withSprint} with no linked sprint</p></div>
                          </div>
                          <div className="grid grid-cols-3 gap-3 text-right sm:min-w-[330px]">
                            <div><p className="text-[10px] text-slate-500">Executed</p><p className="text-xs font-bold text-slate-800">{pod.executed}/{pod.total}</p></div>
                            <div><p className="text-[10px] text-slate-500">Passed</p><p className="text-xs font-bold text-emerald-700">{pod.passed}</p></div>
                            <div><p className="text-[10px] text-slate-500">Pass rate</p><p className="text-xs font-bold text-slate-800">{pod.passRate === null ? "—" : `${pod.passRate}%`}</p></div>
                          </div>
                        </div>
                        <div className="ml-11 mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 sm:mr-[342px]">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pod.progress}%` }} />
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="border-t border-slate-100 bg-slate-50/70 p-3 sm:p-4">
                          {pod.sprintRows.length === 0 ? <p className="px-2 py-4 text-center text-xs text-slate-500">No sprint groups match the selected filters.</p> : (
                            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                              {pod.sprintRows.map((row) => (
                                <button key={`${row.pod}-${row.sprint}`} type="button" onClick={() => openZephyrModal(`${row.pod} · ${row.sprint}`, `${row.total} cases · ${row.executed} executed`, row.cases)} className="rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-indigo-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">
                                  <div className="flex items-start justify-between gap-2"><span className="text-xs font-semibold leading-5 text-slate-800">{row.sprint}</span><span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">{row.total} cases</span></div>
                                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500"><span>{row.executed} executed</span><span className="font-semibold text-emerald-700">{row.passed} passed</span>{row.failed > 0 && <span className="font-semibold text-rose-700">{row.failed} failed</span>}{row.blocked > 0 && <span className="font-semibold text-amber-700">{row.blocked} blocked</span>}{row.inProgress > 0 && <span className="font-semibold text-sky-700">{row.inProgress} in progress</span>}{row.pending > 0 && <span>{row.pending} not run</span>}</div>
                                  <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-[10px]"><span className="text-slate-500">Pass rate</span><span className="font-bold text-slate-800">{row.passRate === null ? "No executions yet" : `${row.passRate}%`}</span></div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </div>
          {zephyrModal && (
            <DetailModal title={zephyrModal.title} subtitle={zephyrModal.subtitle} onClose={() => setZephyrModal(null)} wide>
              <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
                <input
                  value={zephyrModalSearch}
                  onChange={(event) => setZephyrModalSearch(event.target.value)}
                  placeholder="Search cases, owners, sprints, or linked issues"
                  aria-label="Search test cases in this popup"
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
                <span className="text-xs text-slate-500">{zephyrModalCases.length} of {zephyrModal.cases.length} cases</span>
              </div>
              <div className="divide-y divide-slate-100">
                {zephyrModalCases.length === 0 ? <p className="p-6 text-sm text-slate-500">{zephyrModal.cases.length ? "No test cases match your search." : "No matching test cases."}</p> : zephyrModalCases.map((testCase) => (
                  <article key={`${testCase.projectKey}-${testCase.id}`} className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold text-indigo-700">{jiraDomain ? <a href={`${jiraDomain}/browse/${testCase.key}`} target="_blank" rel="noopener noreferrer" className="hover:underline">{testCase.key}</a> : testCase.key} <span className="font-normal text-slate-500">· {testCase.projectName} ({testCase.projectKey})</span></p><h4 className="mt-1 text-sm font-semibold text-slate-900">{testCase.name}</h4></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-700">{testCase.latestExecution?.status ?? "Not run yet"}</span></div>
                    <div className="mt-3 grid gap-x-5 gap-y-2 text-xs text-slate-600 sm:grid-cols-2"><p><b>Pod:</b> {testCase.podNames.join(", ") || "Unmapped pod"}</p><p><b>Sprint:</b> {testCase.sprints?.join(", ") || "No linked Jira sprint"}</p><p><b>Owner:</b> {testCase.ownerName}</p><p><b>Priority / folder:</b> {testCase.priority} · {testCase.folder}</p><p className="sm:col-span-2"><b>Linked Jira issues:</b> {testCase.linkedIssueKeys.length ? testCase.linkedIssueKeys.map((key, index) => <span key={key}>{index > 0 ? ", " : ""}{jiraDomain ? <a href={`${jiraDomain}/browse/${key}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-indigo-700 hover:underline">{key}</a> : key}</span>) : "None"}</p><p><b>Executions:</b> {testCase.executionCount}</p></div>
                    {testCase.objective && <p className="mt-3 text-xs text-slate-600"><b>Objective:</b> {testCase.objective}</p>}
                    {testCase.executions.length > 0 && <div className="mt-3 rounded-lg bg-slate-50 p-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Execution history</p><div className="space-y-1.5">{testCase.executions.map((execution) => <p key={execution.id} className="text-xs text-slate-600">{execution.status} · {execution.executedBy} · {execution.executedOn ? new Date(execution.executedOn).toLocaleDateString() : "Date unavailable"} · {execution.cycle || "No cycle"}</p>)}</div></div>}
                  </article>
                ))}
              </div>
            </DetailModal>
          )}
        </section>
      )}

      {/* ---- QA Team Capacity & Workload (phase 1) ---- */}
      {qaCapacity && (
        <>
          {zephyr?.message && (
            <div className="rounded-md border border-jira-amber/40 bg-jira-amber/10 px-4 py-3">
              <p className="text-xs font-bold text-jira-text">
                {zephyr.available ? "Some Zephyr project data is unavailable" : "Zephyr execution data is unavailable"}
              </p>
              <p className="text-[11px] text-jira-text-muted mt-1">
                {zephyr.message}
                {!zephyr.available && " Check the Zephyr API configuration and the signed-in account’s project access."}
              </p>
            </div>
          )}
          {qaCapacity.members.length === 0 && qaRosterConfigured === 0 && (
            <div className="bg-white border border-jira-amber/40 rounded-lg p-5 shadow-sm">
              <h2 className="text-base font-bold text-jira-text">QA Team Capacity &amp; Workload</h2>
              <p className="text-sm text-jira-text-muted mt-2">
                No QA members are configured yet. Add the QA names to your environment
                (<code className="font-mono">JIRA_QA_MEMBERS</code> in <code className="font-mono">.env.local</code>
                for localhost, or Forge variables for Jira), then restart <code className="font-mono">pnpm dev</code>.
                See <code className="font-mono">documentation/08-complete-system-guide.md</code>, section 3.3.1.
              </p>
            </div>
          )}
          <div className="bg-white border border-jira-border rounded-lg p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-jira-border pb-4 mb-4">
              <div>
                <h2 className="text-base font-bold text-jira-text">QA Team Capacity &amp; Workload</h2>
                <p className="text-xs text-jira-text-muted mt-0.5">
                  {qaVisibleMembers.length} members · weekly capacity {qaScopeTotals.capacity} hrs ·{" "}
                  {zephyr?.available && typeof zephyr.testCasesTotal === "number"
                    ? `${zephyr.testCasesTotal} Zephyr test cases · `
                    : ""}
                  {qaCapacity.testCasesTotal} Jira test-type issues tracked
                </p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="text-xs font-semibold px-3 py-1 bg-jira-blue-bg text-jira-blue rounded-full border border-jira-blue/20">
                  {qaScopeTotals.available} hrs available
                </span>
                <select
                  value={qaPod}
                  onChange={(e) => {
                    const next = e.target.value;
                    setQaPod(next);
                    setModal(null);
                  }}
                  className="text-xs font-semibold px-2 py-1.5 bg-white border border-jira-border rounded"
                  aria-label="Filter QA team by pod"
                >
                  <option value="all">All pods</option>
                  {qaPodOptions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <select value={qaMember} onChange={(event) => setQaMember(event.target.value)} aria-label="Filter QA workload by member" className="text-xs font-semibold px-2 py-1.5 bg-white border border-jira-border rounded">
                  <option value="all">All members</option>
                  {qaCapacity.members.map((member) => <option key={member.name} value={member.name}>{member.name}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
              <button
                type="button"
                onClick={() =>
                  open(
                    "Total QA Capacity",
                    `${qaVisibleMembers.length} members · header rows below show per-person splits`,
                    qaVisibleMembers.flatMap((m) =>
                      issues.filter(
                        (i) => new Set([m.name, ...(m.aliasNames ?? [])]).has(i.assignee)
                      )
                    )
                  )
                }
                className="text-left p-4 bg-jira-bg rounded-lg border border-jira-border/50 hover:border-jira-blue/50 hover:shadow-sm transition"
              >
                <p className="text-xs uppercase text-jira-text-muted font-bold">Total QA Capacity</p>
                <p className="text-2xl font-bold text-jira-text mt-1">{qaScopeTotals.capacity} hrs</p>
                <p className="text-[11px] text-jira-text-light mt-1">Per member · weekly</p>
              </button>
              <button
                type="button"
                onClick={() =>
                  open(
                    "Allocated Hours",
                    `Open assigned work across ${qaVisibleMembers.length} QA members`,
                    qaVisibleMembers.flatMap((m) =>
                      issues.filter(
                        (i) =>
                          new Set([m.name, ...(m.aliasNames ?? [])]).has(i.assignee) &&
                          !i.isDone
                      )
                    )
                  )
                }
                className="text-left p-4 bg-jira-bg rounded-lg border border-jira-border/50 hover:border-jira-blue/50 hover:shadow-sm transition"
              >
                <p className="text-xs uppercase text-jira-text-muted font-bold">Allocated</p>
                <p className="text-2xl font-bold text-jira-blue mt-1">{qaScopeTotals.allocated} hrs</p>
                <p className="text-[11px] text-jira-text-light mt-1">Open assigned work</p>
              </button>
              <button
                type="button"
                onClick={() =>
                  open(
                    "Supported Load",
                    "Open work on support-type issues",
                    qaVisibleMembers.flatMap((m) =>
                      issues.filter(
                        (i) =>
                          new Set([m.name, ...(m.aliasNames ?? [])]).has(i.assignee) &&
                          !i.isDone &&
                          /^support/i.test(i.workType)
                      )
                    )
                  )
                }
                className="text-left p-4 bg-jira-bg rounded-lg border border-jira-border/50 hover:border-jira-amber/50 hover:shadow-sm transition"
              >
                <p className="text-xs uppercase text-jira-text-muted font-bold">Supported Load</p>
                <p className="text-2xl font-bold text-jira-amber mt-1">{qaScopeTotals.supported} hrs</p>
                <p className="text-[11px] text-jira-text-light mt-1">Open support-type work</p>
              </button>
              <button
                type="button"
                onClick={() =>
                  open(
                    "Available Capacity",
                    `Work you can still assign across ${qaVisibleMembers.length} members`,
                    qaVisibleMembers.flatMap((m) =>
                      issues.filter(
                        (i) =>
                          new Set([m.name, ...(m.aliasNames ?? [])]).has(i.assignee) &&
                          !i.isDone
                      )
                    )
                  )
                }
                className="text-left p-4 bg-jira-bg rounded-lg border border-jira-border/50 hover:border-jira-green/50 hover:shadow-sm transition"
              >
                <p className="text-xs uppercase text-jira-text-muted font-bold">Available</p>
                <p className="text-2xl font-bold text-jira-green mt-1">{qaScopeTotals.available} hrs</p>
                <p className="text-[11px] text-jira-text-light mt-1">Capacity minus load</p>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-jira-bg text-jira-text-muted text-xs uppercase border-b border-jira-border font-semibold">
                  <tr>
                    <th className="px-4 py-2.5">Member</th>
                    <th className="px-4 py-2.5">Teams</th>
                    <th className="px-4 py-2.5 text-center">Assigned</th>
                    <th className="px-4 py-2.5 text-center">Allocated</th>
                    <th className="px-4 py-2.5 text-center">Supported</th>
                    <th className="px-4 py-2.5 text-center">Available</th>
                    <th className="px-4 py-2.5 text-center">Jira Test Issues</th>
                    <th className="px-4 py-2.5 text-center">Zephyr Execs</th>
                    <th className="px-4 py-2.5">Load</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-jira-border/60">
                  {qaCapacity.members.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-6 text-center text-xs text-jira-text-muted">
                        No workload rows to show — see the note below the table.
                      </td>
                    </tr>
                  )}
                  {qaVisibleMembers.map((m) => (
                    <tr
                      key={m.name}
                      onClick={() => openMember(m)}
                      className="transition-colors cursor-pointer hover:bg-jira-bg"
                    >
                      <td className="px-4 py-3 font-semibold text-xs">{m.name}</td>
                      <td className="px-4 py-3 text-xs text-jira-text-muted">
                        {m.podNames.join(", ") || m.podKeys.join(", ") || "—"}
                      </td>
                      <td className="px-4 py-3 text-center text-xs font-semibold">{sliced(m).assigned}</td>
                      <td className="px-4 py-3 text-center text-xs">{sliced(m).allocated} hrs</td>
                      <td className="px-4 py-3 text-center text-xs">{sliced(m).supported} hrs</td>
                      <td className="px-4 py-3 text-center text-xs font-bold text-jira-green">
                        {sliced(m).available} hrs
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        {sliced(m).tests}
                        {sliced(m).openTests < sliced(m).tests && (
                          <span className="text-[10px] text-jira-text-light ml-1">
                            ({sliced(m).tests - sliced(m).openTests} done)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-[11px] text-jira-text-muted whitespace-nowrap">
                        {zephyr?.available ? m.executions ?? "—" : zephyr?.message?.slice(0, 40) ?? "—"}
                        {!zephyr && "—"}
                      </td>
                      <td className="px-4 py-3 min-w-[130px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-jira-border/40 rounded-full overflow-hidden">
                            <div
                              className={`h-2 ${loadColor(memberUtilisation(m))} rounded-full`}
                              style={{ width: `${Math.min(memberUtilisation(m), 100)}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-bold text-jira-text-muted w-8 text-right">
                            {memberUtilisation(m)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {qaCapacity.members.length === 0 && (
              <div className="mt-4 rounded-md border border-jira-amber/40 bg-jira-amber/10 px-4 py-3">
                <p className="text-xs font-bold text-jira-text">
                  No Jira issues matched the configured QA roster.
                </p>
                <p className="text-[11px] text-jira-text-muted mt-1">
                  Check that <code className="font-mono break-all">JIRA_QA_MEMBERS</code> is deployed to the
                  currently running app version (Forge variables are baked in at deploy time —
                  re-run <code className="font-mono">forge deploy</code> after{" "}
                  <code className="font-mono">forge variables set</code>), and that the names
                  match Jira display names for these members.
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {modal && (
        <IssuesModal
          title={modal.title}
          subtitle={modal.subtitle}
          issues={modal.issues}
          jiraDomain={jiraDomain}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

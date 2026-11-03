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
  // QA tab owns its filters: an in-tab pod filter independent from the shared
  // pod/quarter/sprint bar (which is hidden on this tab).
  const [qaPod, setQaPod] = useState("all");
  const [qaMember, setQaMember] = useState("all");
  const [defectPod, setDefectPod] = useState("all");
  const [defectReporterSearch, setDefectReporterSearch] = useState("");
  const [zephyrSearch, setZephyrSearch] = useState("");
  const [zephyrScope, setZephyrScope] = useState("all");
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
  const isReopenedDefect = (issue: IssueRow) => /\breopen(?:ed)?\b/i.test(issue.status);
  const defectAnalysisRows = uniqueIssues(defectRows.filter((issue) => /^bug$/i.test(issue.workType)));
  const cancelledDefectRows = defectAnalysisRows.filter(isCancelledDefect);
  const completedDefectRows = defectAnalysisRows.filter((issue) => isCompletedDefect(issue) && !isCancelledDefect(issue));
  const reopenedDefectRows = defectAnalysisRows.filter(isReopenedDefect);
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
    { title: "Reopened Defects", value: reopenedDefectRows.length, note: "Current status includes “reopened”", subtitle: `${reopenedDefectRows.length} bugs currently have a reopened status; these are also included in Open Defects`, rows: reopenedDefectRows, tone: "orange" },
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
  const zephyrSprintOptions = Array.from(new Set(zephyrCases.flatMap((testCase) => testCase.sprints ?? []))).sort((a, b) => a.localeCompare(b));
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

  const selectedZephyrScope = zephyrScopeOptions.find((option) => option.value === zephyrScope);
  const scopedZephyrCases = zephyrCases.filter((testCase) => {
    const scopeMatch = zephyrScope === "all" || Boolean(selectedZephyrScope && (
      selectedZephyrScope.podNames.some((pod) => testCase.podNames.includes(pod)) ||
      selectedZephyrScope.projectKeys.some((key) => testCase.projectKey.toLowerCase() === key.toLowerCase())
    ));
    const sprintMatch = zephyrSprint === "all" || (zephyrSprint === "__no_sprint__" ? !(testCase.sprints?.length) : (testCase.sprints ?? []).includes(zephyrSprint));
    const executionMatch = zephyrExecutionStatus === "all" ||
      (testCase.latestExecution?.statusCategory ?? "pending") === zephyrExecutionStatus;
    const query = zephyrSearch.trim().toLowerCase();
    const searchMatch = !query || [testCase.key, testCase.name, testCase.ownerName, testCase.projectKey,
      testCase.projectName, ...testCase.podNames, ...testCase.labels, ...testCase.linkedIssueKeys,
      ...testCase.executions.flatMap((execution) => [execution.assignedTo, execution.executedBy])]
      .some((value) => value.toLowerCase().includes(query));
    return scopeMatch && sprintMatch && executionMatch && searchMatch;
  });
  const executionCounts = (cases: typeof zephyrCases) => cases.reduce((counts, testCase) => {
    const status = testCase.latestExecution?.statusCategory ?? "pending";
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {} as Record<string, number>);
  const scopedExecutionCounts = executionCounts(scopedZephyrCases);
  const showEntqaAutomationStatus = selectedZephyrScope?.projectKeys.some((key) => key.toUpperCase() === "ENTQA") ?? false;
  const entqaApprovedCases = scopedZephyrCases.filter((testCase) => /^approved$/i.test(testCase.status));
  const entqaDraftCases = scopedZephyrCases.filter((testCase) => /^draft$/i.test(testCase.status));
  const podSprintPerformance = (() => {
    const groups = new Map<string, { pod: string; sprint: string; cases: Map<string, (typeof scopedZephyrCases)[number]> }>();
    for (const testCase of scopedZephyrCases) {
      const pods = testCase.podNames.length ? testCase.podNames : ["Unmapped pod"];
      const sprints = testCase.sprints?.length ? testCase.sprints : ["Backlog / no linked sprint"];
      for (const pod of pods) for (const sprint of sprints) {
        const key = `${pod}\u0000${sprint}`;
        if (!groups.has(key)) groups.set(key, { pod, sprint, cases: new Map() });
        groups.get(key)!.cases.set(testCase.key, testCase);
      }
    }
    return Array.from(groups.values()).map((group) => {
      const cases = Array.from(group.cases.values());
      const count = (category: string) => cases.filter((testCase) => (testCase.latestExecution?.statusCategory ?? "pending") === category).length;
      const passed = count("passed");
      const executed = cases.filter((testCase) => testCase.executionCount > 0).length;
      return { ...group, cases, total: cases.length, executed, passed, failed: count("failed"), blocked: count("blocked"), inProgress: count("in-progress"), pending: count("pending"), passRate: executed ? Math.round((passed / executed) * 100) : null };
    }).sort((a, b) => a.pod.localeCompare(b.pod) || a.sprint.localeCompare(b.sprint));
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
        <div className="grid grid-cols-1 gap-3 border-b border-slate-200 bg-slate-50/70 p-5 sm:grid-cols-2 sm:p-7 xl:grid-cols-3">
          {defectMetricCards.map((card) => (
            <button
              key={card.title}
              type="button"
              onClick={() => open(card.title, card.subtitle, card.rows)}
              className={`rounded-xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${toneClasses[card.tone]}`}
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.12em]">{card.title}</p>
              <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{card.value}</p>
              <p className="mt-1 text-[11px] text-slate-500">{card.note}</p>
              <p className="mt-3 text-[10px] font-semibold text-slate-400">View Jira analysis ↗</p>
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
                  <h3 className="text-sm font-bold text-slate-900">Reporter workload by pod</h3>
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
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <input value={zephyrSearch} onChange={(event) => setZephyrSearch(event.target.value)} placeholder="Search cases or people" aria-label="Search Zephyr test cases" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
              <select value={zephyrScope} onChange={(event) => setZephyrScope(event.target.value)} aria-label="Filter by QA pod or project" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"><option value="all">All pods</option>{zephyrScopeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
              <select value={zephyrSprint} onChange={(event) => setZephyrSprint(event.target.value)} aria-label="Filter by Jira sprint" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"><option value="all">All sprints</option>{zephyrSprintOptions.map((sprint) => <option key={sprint} value={sprint}>{sprint}</option>)}<option value="__no_sprint__">Backlog / no linked sprint</option></select>
              <select value={zephyrExecutionStatus} onChange={(event) => setZephyrExecutionStatus(event.target.value)} aria-label="Filter by execution status" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"><option value="all">All execution statuses</option><option value="passed">Passed</option><option value="failed">Failed</option><option value="blocked">Blocked</option><option value="in-progress">In progress</option><option value="pending">Not run yet</option></select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 sm:grid-cols-3 lg:grid-cols-5 sm:p-5">
            {[
              { label: "Cases", value: scopedZephyrCases.length, category: "all", color: "text-indigo-700" },
              { label: "Passed", value: scopedExecutionCounts.passed ?? 0, category: "passed", color: "text-emerald-700" },
              { label: "Failed", value: scopedExecutionCounts.failed ?? 0, category: "failed", color: "text-rose-700" },
              { label: "Blocked / in progress", value: (scopedExecutionCounts.blocked ?? 0) + (scopedExecutionCounts["in-progress"] ?? 0), category: "blocked-wip", color: "text-amber-700" },
              { label: "Not run yet", value: scopedExecutionCounts.pending ?? 0, category: "pending", color: "text-slate-700" },
            ].map((card) => {
              const matchingCases = card.category === "all" ? scopedZephyrCases : card.category === "blocked-wip"
                ? scopedZephyrCases.filter((testCase) => ["blocked", "in-progress"].includes(testCase.latestExecution?.statusCategory ?? "pending"))
                : scopedZephyrCases.filter((testCase) => (testCase.latestExecution?.statusCategory ?? "pending") === card.category);
              return (
                <button key={card.label} type="button" onClick={() => setZephyrModal({ title: card.label, subtitle: `${matchingCases.length} matching test cases in the selected filters`, cases: matchingCases })} className="rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-300">
                  <p className={`text-[10px] font-bold uppercase tracking-wide ${card.color}`}>{card.label}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{card.value}</p>
                  <p className="mt-1 text-[10px] text-slate-500">Click to view cases</p>
                </button>
              );
            })}
          </div>
          {showEntqaAutomationStatus && (
            <div className="border-t border-slate-200 bg-white px-4 py-4 sm:px-6">
              <div className="mb-3"><h3 className="text-sm font-bold text-slate-900">ENTQA case status</h3><p className="mt-1 text-xs text-slate-500">Approved test cases are grouped as Automated; Draft test cases are grouped as Pending.</p></div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { title: "Automated", status: "Approved", cases: entqaApprovedCases, style: "border-emerald-200 bg-emerald-50 text-emerald-800" },
                  { title: "Pending", status: "Draft", cases: entqaDraftCases, style: "border-amber-200 bg-amber-50 text-amber-800" },
                ].map((card) => (
                  <button key={card.title} type="button" onClick={() => setZephyrModal({ title: `ENTQA · ${card.title}`, subtitle: `${card.cases.length} test cases with Zephyr status “${card.status}”`, cases: card.cases })} className={`rounded-xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-300 ${card.style}`}>
                    <span className="text-[10px] font-bold uppercase tracking-wide">{card.title}</span>
                    <span className="mt-1 flex items-end justify-between"><span className="text-2xl font-bold">{card.cases.length}</span><span className="text-[11px]">Zephyr status: {card.status} · View cases</span></span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="border-t border-slate-200 px-4 py-4 sm:px-6">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div><h3 className="text-sm font-bold text-slate-900">Pod and sprint execution analysis</h3><p className="mt-1 text-xs text-slate-500">Case counts use the latest execution per case. A case linked to multiple Jira sprints appears in each applicable sprint row.</p></div>
              <span className="text-[11px] text-slate-500">{podSprintPerformance.length} pod/sprint groups</span>
            </div>
            {podSprintPerformance.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">No cases match these filters.</p> : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[850px] text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Pod</th><th className="px-3 py-3">Sprint</th><th className="px-3 py-3 text-center">Cases</th><th className="px-3 py-3 text-center">Executed</th><th className="px-3 py-3 text-center">Passed</th><th className="px-3 py-3 text-center">Failed</th><th className="px-3 py-3 text-center">Blocked</th><th className="px-3 py-3 text-center">In progress</th><th className="px-3 py-3 text-center">Not run</th><th className="px-3 py-3 text-center">Pass rate</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{podSprintPerformance.map((row) => (
                    <tr key={`${row.pod}-${row.sprint}`} className="hover:bg-indigo-50/40">
                      <th className="px-3 py-3 font-semibold text-slate-800">{row.pod}</th><td className="px-3 py-3 text-slate-600">{row.sprint}</td>
                      <td className="px-3 py-3 text-center"><button type="button" className="font-bold text-indigo-700 underline-offset-2 hover:underline" onClick={() => setZephyrModal({ title: `${row.pod} · ${row.sprint}`, subtitle: `${row.total} test cases · ${row.executed} with an execution`, cases: row.cases })}>{row.total}</button></td>
                      <td className="px-3 py-3 text-center">{row.executed}</td><td className="px-3 py-3 text-center font-semibold text-emerald-700">{row.passed}</td><td className="px-3 py-3 text-center font-semibold text-rose-700">{row.failed}</td><td className="px-3 py-3 text-center">{row.blocked}</td><td className="px-3 py-3 text-center">{row.inProgress}</td><td className="px-3 py-3 text-center">{row.pending}</td><td className="px-3 py-3 text-center">{row.passRate === null ? "—" : `${row.passRate}%`}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
          {zephyrModal && (
            <DetailModal title={zephyrModal.title} subtitle={zephyrModal.subtitle} onClose={() => setZephyrModal(null)} wide>
              <div className="divide-y divide-slate-100">
                {zephyrModal.cases.length === 0 ? <p className="p-6 text-sm text-slate-500">No matching test cases.</p> : zephyrModal.cases.map((testCase) => (
                  <article key={`${testCase.projectKey}-${testCase.id}`} className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold text-indigo-700">{testCase.key} <span className="font-normal text-slate-500">· {testCase.projectName} ({testCase.projectKey})</span></p><h4 className="mt-1 text-sm font-semibold text-slate-900">{testCase.name}</h4></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-700">{testCase.latestExecution?.status ?? "Not run yet"}</span></div>
                    <div className="mt-3 grid gap-x-5 gap-y-2 text-xs text-slate-600 sm:grid-cols-2"><p><b>Pod:</b> {testCase.podNames.join(", ") || "Unmapped pod"}</p><p><b>Sprint:</b> {testCase.sprints?.join(", ") || "Backlog / no linked sprint"}</p><p><b>Owner:</b> {testCase.ownerName}</p><p><b>Priority / folder:</b> {testCase.priority} · {testCase.folder}</p><p><b>Linked Jira issues:</b> {testCase.linkedIssueKeys.join(", ") || "None"}</p><p><b>Executions:</b> {testCase.executionCount}</p></div>
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

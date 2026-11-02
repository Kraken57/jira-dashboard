"use client";

import { useState } from "react";
import {
  IssueRow,
  QualityData,
  QaCapacityData,
  QaMemberStat,
  ZephyrData,
} from "@/lib/jira/types";
import { IssuesModal } from "@/components/IssuesModal";

interface QualityTabProps {
  data: QualityData;
  qaCapacity?: QaCapacityData;
  qaRosterConfigured?: number;
  zephyr?: ZephyrData;
  issues?: IssueRow[];
  qaDefects?: IssueRow[];
  fetchedAt?: number;
  jiraDomain?: string;
}

export function QualityTab({ data, qaCapacity, qaRosterConfigured = 0, zephyr, issues = [], qaDefects = [], fetchedAt, jiraDomain }: QualityTabProps) {
  const [modal, setModal] = useState<{
    title: string;
    subtitle: string;
    issues: IssueRow[];
  } | null>(null);
  // QA tab owns its filters: an in-tab pod filter independent from the shared
  // pod/quarter/sprint bar (which is hidden on this tab).
  const [qaPod, setQaPod] = useState("all");
  const [defectProject, setDefectProject] = useState("all");
  const [defectReporterSearch, setDefectReporterSearch] = useState("");

  const bugs = issues.filter((i) => i.workType === "Bug");
  const resolvedBugs = bugs.filter((i) => i.isDone);
  const defectProjects = Array.from(
    new Map(qaDefects.map((issue) => {
      const key = issue.projectKey || issue.podKey || "UNKNOWN";
      return [key, { key, name: issue.projectName || issue.podName || key }] as const;
    })).values()
  ).sort((a, b) => a.name.localeCompare(b.name));
  const defectScope = qaDefects.filter((issue) =>
    defectProject === "all" || (issue.projectKey || issue.podKey || "UNKNOWN") === defectProject
  );
  const allReporterNames = Array.from(new Set(qaDefects.map((issue) => issue.reporter || "Unassigned")))
    .sort((a, b) => a.localeCompare(b));
  const defectRows = defectScope.filter((issue) =>
    !defectReporterSearch.trim() || (issue.reporter || "Unassigned").toLowerCase().includes(defectReporterSearch.trim().toLowerCase())
  );
  const defectStatuses = Array.from(new Set(defectRows.map((issue) => issue.status)))
    .sort((a, b) => a.localeCompare(b));
  const reporterNames = Array.from(new Set(defectRows.map((issue) => issue.reporter || "Unassigned")))
    .sort((a, b) => a.localeCompare(b));
  const defectColumns = defectProject === "all"
    ? defectProjects
    : defectProjects.filter((project) => project.key === defectProject);
  const defectsFor = (reporter: string, projectKey: string) => defectRows.filter((issue) =>
    (issue.reporter || "Unassigned") === reporter && (issue.projectKey || issue.podKey || "UNKNOWN") === projectKey
  );
  const open = (title: string, subtitle: string, list: IssueRow[]) =>
    setModal({ title, subtitle, issues: list });

  const openMember = (m: QaMemberStat) => {
    const s = sliced(m);
    open(
      `QA Workload · ${m.name}`,
      `${s.assigned} items · ${m.podNames.join(", ") || m.podKeys.join(", ") || "no pod"} · ${s.allocated} of ${m.capacityHours} hrs allocated · ${s.tests} test case${s.tests === 1 ? "" : "s"}`,
      memberIssueRows(m)
    );
  };

  // In-tab pod options derive from the QA members' actual teams.
  const qaPodOptions = Array.from(
    new Set((qaCapacity?.members ?? []).flatMap((m) => m.podNames))
  ).sort((a, b) => a.localeCompare(b));

  const sliceMember = (m: QaMemberStat) => {
    if (qaPod === "all") return { allocated: m.allocatedHours, supported: m.supportedHours, available: m.availableHours, tests: m.testCases, openTests: m.openTestCases, assigned: m.assignedIssues };
    const matchesPod = (key: string) => m.podKeys.includes(key) || (qaPodOptions.includes(qaPod) && (m.podNames?.includes(qaPod) ?? false));
    const allocByPod = m.hoursByPod ?? {};
    const supByPod = m.supportByPod ?? {};
    const tesByPod = m.testsByPod ?? {};
    const issByPod = m.issuesByPod ?? {};
    let podKey: string | undefined = undefined;
    for (const i in allocByPod) if (matchesPod(i)) podKey = i;
    if (!podKey) for (const i in tesByPod) if (matchesPod(i)) podKey = i;
    const allocated = podKey ? (allocByPod[podKey] ?? 0) : 0;
    const supported = podKey ? (supByPod[podKey] ?? 0) : 0;
    const load = Math.round((allocated + supported) * 10) / 10;
    return {
      allocated,
      supported,
      available: Math.round(Math.max(0, (m.capacityHours ?? 0) - load) * 10) / 10,
      tests: podKey ? (tesByPod[podKey] ?? 0) : 0,
      openTests: 0,
      assigned: podKey ? (issByPod[podKey] ?? 0) : 0,
    };
  };

  const sliced = (m: QaMemberStat) => sliceMember(m);

  const memberIssueRows = (m: QaMemberStat) =>
    issues.filter((i) => new Set([m.name, ...(m.aliasNames ?? [])]).has(i.assignee));

  // Utilization bar color: green under 70% load, amber 70-100, red over.
  const loadColor = (pct: number) =>
    pct <= 70
      ? "bg-jira-green"
      : pct <= 100
      ? "bg-jira-amber"
      : "bg-jira-red";

  return (
    <div className="space-y-6">
      {/* ---- QA defects ---- */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5">
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-5 py-6 text-white sm:px-7">
          <div className="pointer-events-none absolute -right-8 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-200">Quality overview</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">QA Defects</h2>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-indigo-50">{defectRows.length} issues</span>
              </div>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">Track status and ownership across projects. Select a count to open the matching Jira issues.</p>
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
                  className="w-full rounded-xl border border-white/15 bg-white/10 py-2.5 pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-400/30"
                />
                <datalist id="qa-reporter-name-options">
                  {allReporterNames.map((name) => <option key={name} value={name} />)}
                </datalist>
              </label>
              <label className="block sm:w-56">
                <span className="sr-only">Filter defects by project</span>
                <select
                  value={defectProject}
                  onChange={(event) => setDefectProject(event.target.value)}
                  aria-label="Filter QA defects by project"
                  className="w-full rounded-xl border border-white/15 bg-slate-800 px-3 py-2.5 text-sm font-medium text-white outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-400/30"
                >
                  <option value="all">All pods</option>
                  {defectProjects.map((project) => <option key={project.key} value={project.key}>{project.name}</option>)}
                </select>
              </label>
            </div>
          </div>
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
          <div className="space-y-6 p-5 sm:p-7">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
              <button type="button" onClick={() => open("Total QA Defects", "Defects in the selected project and reporter scope", defectRows)} className="group rounded-xl border border-indigo-100 bg-indigo-50/70 p-4 text-left transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-indigo-700">Total defects</p>
                <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{defectRows.length}</p>
                <p className="mt-1 text-[11px] text-slate-500">All selected issues</p>
              </button>
              {defectStatuses.map((status) => {
                const rows = defectRows.filter((issue) => issue.status === status);
                const statusTone = /accept|done|closed|resolved|released/i.test(status)
                  ? "border-emerald-100 bg-emerald-50/70 text-emerald-700"
                  : /cancel|reject/i.test(status)
                  ? "border-rose-100 bg-rose-50/70 text-rose-700"
                  : "border-slate-200 bg-slate-50 text-slate-600";
                return (
                  <button key={status} type="button" onClick={() => open(`${status} QA Defects`, `${rows.length} Jira issues`, rows)} className={`group rounded-xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${statusTone}`}>
                    <p className="truncate text-[10px] font-bold uppercase tracking-[0.12em]" title={status}>{status}</p>
                    <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{rows.length}</p>
                    <p className="mt-1 text-[11px] text-slate-500">View matching issues</p>
                  </button>
                );
              })}
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="flex flex-col gap-1 border-b border-slate-200 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Reporter workload by project</h3>
                  <p className="mt-0.5 text-[11px] text-slate-500">Names are Jira reporters · click a count to view those defects</p>
                </div>
                <p className="text-[10px] text-slate-400">{fetchedAt ? `Updated ${new Date(fetchedAt).toLocaleString()}` : "Live Jira data"}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="bg-white text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <tr><th className="sticky left-0 z-10 bg-white px-4 py-3">Reporter</th>{defectColumns.map((project) => <th key={project.key} className="px-4 py-3 text-center">{project.name}</th>)}<th className="px-4 py-3 text-center">Total</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reporterNames.map((reporter) => {
                      const rowIssues = defectRows.filter((issue) => (issue.reporter || "Unassigned") === reporter);
                      return <tr key={reporter} className="transition hover:bg-indigo-50/40">
                        <th className="sticky left-0 bg-white px-4 py-3 text-left font-semibold text-slate-800"><span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-blue-100 text-[10px] font-bold text-indigo-800">{reporter.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><span className="ml-2.5 align-middle">{reporter}</span></th>
                        {defectColumns.map((project) => {
                          const cellIssues = defectsFor(reporter, project.key);
                          return <td key={project.key} className="px-4 py-2 text-center"><button type="button" disabled={!cellIssues.length} onClick={() => open(`${reporter} · ${project.name}`, `${cellIssues.length} reported defects`, cellIssues)} className={`min-w-9 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${cellIssues.length ? "bg-indigo-50 text-indigo-700 hover:bg-indigo-100" : "text-slate-300"}`}>{cellIssues.length}</button></td>;
                        })}
                        <td className="px-4 py-2 text-center"><button type="button" onClick={() => open(`${reporter} · All Projects`, `${rowIssues.length} reported defects`, rowIssues)} className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 transition hover:bg-slate-100">{rowIssues.length}</button></td>
                      </tr>;
                    })}
                    <tr className="bg-slate-50 font-bold text-slate-800"><th className="sticky left-0 bg-slate-50 px-4 py-3 text-left">Total issues</th>{defectColumns.map((project) => { const projectRows = defectRows.filter((issue) => (issue.projectKey || issue.podKey || "UNKNOWN") === project.key); return <td key={project.key} className="px-4 py-2 text-center"><button type="button" onClick={() => open(`${project.name} · QA Defects`, `${projectRows.length} defects in project`, projectRows)} className="rounded-lg px-2.5 py-1.5 text-xs font-bold hover:bg-white">{projectRows.length}</button></td>; })}<td className="px-4 py-2 text-center text-xs">{defectRows.length}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ---- QA Team Capacity & Workload (phase 1) ---- */}
      {qaCapacity && (
        <>
          {zephyr && !zephyr.available && (
            <div className="rounded-md border border-jira-amber/40 bg-jira-amber/10 px-4 py-3">
              <p className="text-xs font-bold text-jira-text">Zephyr execution data is unavailable</p>
              <p className="text-[11px] text-jira-text-muted mt-1">{zephyr.message || "The API returned no execution data."} Check the Zephyr API configuration and the signed-in account’s project access.</p>
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
                  {qaCapacity.members.length} members · weekly capacity {qaCapacity.totalCapacityHours} hrs ·{" "}
                  {zephyr?.available && typeof zephyr.testCasesTotal === "number"
                    ? `${zephyr.testCasesTotal} Zephyr test cases · `
                    : ""}
                  {qaCapacity.testCasesTotal} Jira test-type issues tracked
                </p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="text-xs font-semibold px-3 py-1 bg-jira-blue-bg text-jira-blue rounded-full border border-jira-blue/20">
                  {qaPod === "all"
                    ? `${qaCapacity.availableHours} hrs available`
                    : `${qaCapacity.members.reduce((a, m) => a + sliceMember(m).available, 0)} hrs available`}
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
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
              <button
                type="button"
                onClick={() =>
                  open(
                    "Total QA Capacity",
                    `${qaCapacity.members.length} members · header rows below show per-person splits`,
                    qaCapacity.members.flatMap((m) =>
                      issues.filter(
                        (i) => new Set([m.name, ...(m.aliasNames ?? [])]).has(i.assignee)
                      )
                    )
                  )
                }
                className="text-left p-4 bg-jira-bg rounded-lg border border-jira-border/50 hover:border-jira-blue/50 hover:shadow-sm transition"
              >
                <p className="text-xs uppercase text-jira-text-muted font-bold">Total QA Capacity</p>
                <p className="text-2xl font-bold text-jira-text mt-1">{qaCapacity.totalCapacityHours} hrs</p>
                <p className="text-[11px] text-jira-text-light mt-1">Per member · weekly</p>
              </button>
              <button
                type="button"
                onClick={() =>
                  open(
                    "Allocated Hours",
                    `Open assigned work across ${qaCapacity.members.length} QA members`,
                    qaCapacity.members.flatMap((m) =>
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
                <p className="text-2xl font-bold text-jira-blue mt-1">{qaCapacity.allocatedHours} hrs</p>
                <p className="text-[11px] text-jira-text-light mt-1">Open assigned work</p>
              </button>
              <button
                type="button"
                onClick={() =>
                  open(
                    "Supported Load",
                    "Open work on support-type issues",
                    qaCapacity.members.flatMap((m) =>
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
                <p className="text-2xl font-bold text-jira-amber mt-1">{qaCapacity.supportedHours} hrs</p>
                <p className="text-[11px] text-jira-text-light mt-1">Open support-type work</p>
              </button>
              <button
                type="button"
                onClick={() =>
                  open(
                    "Available Capacity",
                    `Work you can still assign across ${qaCapacity.members.length} members`,
                    qaCapacity.members.flatMap((m) =>
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
                <p className="text-2xl font-bold text-jira-green mt-1">{qaCapacity.availableHours} hrs</p>
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
                  {qaCapacity.members.map((m) => (
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
                              className={`h-2 ${loadColor(m.utilisationPct)} rounded-full`}
                              style={{ width: `${Math.min(m.utilisationPct, 100)}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-bold text-jira-text-muted w-8 text-right">
                            {m.utilisationPct}%
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

      {/* ---- Existing defect metrics (kept below) ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => open("Defect Density", "All bugs in the current filters", bugs)}
          className="text-left bg-white border border-jira-border rounded-lg p-4 shadow-sm hover:border-jira-red/50 transition"
        >
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Defect Density</p>
          <p className="text-2xl font-bold text-jira-text mt-1">{data.defectDensity}</p>
          <p className="text-xs text-jira-text-light mt-1">Confirmed defects per 100 delivered SP</p>
        </button>
        <button
          type="button"
          onClick={() =>
            open("Bug Resolution Rate", `${resolvedBugs.length} of ${bugs.length} bugs resolved`, bugs)
          }
          className="text-left bg-white border border-jira-border rounded-lg p-4 shadow-sm hover:border-jira-green/50 transition"
        >
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Bug Resolution Rate</p>
          <p className="text-2xl font-bold text-jira-green mt-1">{data.resolutionRate}%</p>
          <p className="text-xs text-jira-text-light mt-1">{data.resolvedBugs} of {data.totalBugs} bugs resolved</p>
        </button>
        <button
          type="button"
          onClick={() =>
            open("Resolution Time", "Resolved bugs only", resolvedBugs)
          }
          className="text-left bg-white border border-jira-border rounded-lg p-4 shadow-sm hover:border-jira-blue/50 transition"
        >
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Resolution Time</p>
          <p className="text-2xl font-bold text-jira-blue mt-1">{data.avgResolutionDays} days</p>
          <p className="text-xs text-jira-text-light mt-1">Avg (Resolution − Created) for resolved defects</p>
        </button>
        <button
          type="button"
          onClick={() =>
            open("Active Defects", "Unresolved bugs", bugs.filter((i) => !i.isDone))
          }
          className="text-left bg-white border border-jira-border rounded-lg p-4 shadow-sm hover:border-jira-amber/50 transition"
        >
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Active Defects</p>
          <p className="text-2xl font-bold text-jira-amber mt-1">{data.totalBugs - data.resolvedBugs}</p>
          <p className="text-xs text-jira-text-light mt-1">Open bugs in current sprint</p>
        </button>
      </div>

      {/* Priority Distribution */}
      <div className="bg-white border border-jira-border rounded-lg p-5 shadow-sm">
        <h3 className="text-sm font-bold text-jira-text uppercase tracking-wider mb-4">
          Defect Severity & Priority Distribution
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {data.priorityDistribution.map((pd) => (
            <button
              key={pd.priority}
              type="button"
              onClick={() =>
                open(
                  `${pd.priority} Priority`,
                  `${pd.count} work items with ${pd.priority.toLowerCase()} priority`,
                  issues.filter((i) => i.priority === pd.priority)
                )
              }
              className="text-left p-4 bg-jira-bg rounded-lg border border-jira-border/60 hover:border-jira-blue/50 transition"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-jira-text text-sm flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: pd.color }} />
                  {pd.priority} Priority
                </span>
                <span className="text-lg font-bold" style={{ color: pd.color }}>
                  {pd.count}
                </span>
              </div>
              <p className="text-xs text-jira-text-muted mt-2">
                Issues flagged with {pd.priority.toLowerCase()} SLA urgency
              </p>
            </button>
          ))}
        </div>
      </div>

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

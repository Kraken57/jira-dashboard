"use client";

import { useState } from "react";
import {
  IssueRow,
  QualityData,
  QaCapacityData,
  QaMemberStat,
} from "@/lib/jira/types";
import { IssuesModal } from "@/components/IssuesModal";

interface QualityTabProps {
  data: QualityData;
  qaCapacity?: QaCapacityData;
  qaRosterConfigured?: number;
  issues?: IssueRow[];
  jiraDomain?: string;
}

export function QualityTab({ data, qaCapacity, qaRosterConfigured = 0, issues = [], jiraDomain }: QualityTabProps) {
  const [modal, setModal] = useState<{
    title: string;
    subtitle: string;
    issues: IssueRow[];
  } | null>(null);

  const bugs = issues.filter((i) => i.workType === "Bug");
  const resolvedBugs = bugs.filter((i) => i.isDone);
  const open = (title: string, subtitle: string, list: IssueRow[]) =>
    setModal({ title, subtitle, issues: list });

  const openMember = (m: QaMemberStat) => {
    const names = new Set([m.name, ...(m.aliasNames ?? [])]);
    open(
      `QA Workload · ${m.name}`,
      `${m.assignedIssues} items · ${m.podNames.join(", ") || m.podKeys.join(", ") || "no pod"} · ${m.allocatedHours} of ${m.capacityHours} hrs allocated · ${m.testCases} test case${m.testCases === 1 ? "" : "s"}`,
      issues.filter((i) => names.has(i.assignee))
    );
  };

  // Utilization bar color: green under 70% load, amber 70-100, red over.
  const loadColor = (pct: number) =>
    pct <= 70
      ? "bg-jira-green"
      : pct <= 100
      ? "bg-jira-amber"
      : "bg-jira-red";

  return (
    <div className="space-y-6">
      {/* ---- QA Team Capacity & Workload (phase 1) ---- */}
      {qaCapacity && (qaCapacity.members.length > 0 || qaRosterConfigured > 0) && (
        <>
          <div className="bg-white border border-jira-border rounded-lg p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-jira-border pb-4 mb-4">
              <div>
                <h2 className="text-base font-bold text-jira-text">QA Team Capacity &amp; Workload</h2>
                <p className="text-xs text-jira-text-muted mt-0.5">
                  {qaCapacity.members.length} members · weekly capacity {qaCapacity.totalCapacityHours} hrs ·{" "}
                  {qaCapacity.testCasesTotal} test cases tracked
                </p>
              </div>
              <span className="text-xs font-semibold px-3 py-1 bg-jira-blue-bg text-jira-blue rounded-full border border-jira-blue/20 self-start sm:self-auto">
                {qaCapacity.availableHours} hrs available
              </span>
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
                    <th className="px-4 py-2.5 text-center">Test Cases</th>
                    <th className="px-4 py-2.5">Load</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-jira-border/60">
                  {qaCapacity.members.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-xs text-jira-text-muted">
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
                      <td className="px-4 py-3 text-center text-xs font-semibold">{m.assignedIssues}</td>
                      <td className="px-4 py-3 text-center text-xs">{m.allocatedHours} hrs</td>
                      <td className="px-4 py-3 text-center text-xs">{m.supportedHours} hrs</td>
                      <td className="px-4 py-3 text-center text-xs font-bold text-jira-green">
                        {m.availableHours} hrs
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        {m.testCases}
                        {m.openTestCases < m.testCases && (
                          <span className="text-[10px] text-jira-text-light ml-1">
                            ({m.testCases - m.openTestCases} done)
                          </span>
                        )}
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

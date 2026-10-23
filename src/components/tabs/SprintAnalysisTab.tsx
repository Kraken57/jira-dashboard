"use client";

import { useState } from "react";
import { IssueRow, SprintAnalysisData } from "@/lib/jira/types";
import { IssuesModal } from "@/components/IssuesModal";

interface SprintAnalysisTabProps {
  data: SprintAnalysisData;
  issues?: IssueRow[];
  jiraDomain?: string;
}

export function SprintAnalysisTab({
  data,
  issues = [],
  jiraDomain,
}: SprintAnalysisTabProps) {
  const totalItems = data.statusBreakdown.reduce((a, b) => a + b.count, 0);
  const done = issues.filter((i) => i.isDone);
  const [modal, setModal] = useState<{
    title: string;
    subtitle: string;
    issues: IssueRow[];
  } | null>(null);

  const open = (title: string, subtitle: string, list: IssueRow[]) =>
    setModal({ title, subtitle, issues: list });

  return (
    <div className="space-y-6">
      {/* 4 Scope & Flow KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => open("Sprint Scope Churn", "All work items in the current filters", issues)}
          className="text-left bg-white border border-jira-border rounded-lg p-4 shadow-sm hover:border-jira-amber/50 transition"
        >
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Sprint Scope Churn</p>
          <p className="text-2xl font-bold text-jira-amber mt-1">{data.scopeChurnPct > 0 ? `${data.scopeChurnPct}%` : "N/A"}</p>
          <p className="text-xs text-jira-text-light mt-1">Requires issue changelog</p>
        </button>
        <button
          type="button"
          onClick={() => open("Planned Work Share", "All work items in the current filters", issues)}
          className="text-left bg-white border border-jira-border rounded-lg p-4 shadow-sm hover:border-jira-blue/50 transition"
        >
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Planned Work Share</p>
          <p className="text-2xl font-bold text-jira-blue mt-1">{data.plannedWorkPct}%</p>
          <p className="text-xs text-jira-text-light mt-1">{data.unplannedWorkPct}% unplanned/emergency</p>
        </button>
        <button
          type="button"
          onClick={() => open("Avg Cycle Time", "Completed work items", done)}
          className="text-left bg-white border border-jira-border rounded-lg p-4 shadow-sm hover:border-jira-blue/50 transition"
        >
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Avg Cycle Time</p>
          <p className="text-2xl font-bold text-jira-text mt-1">{data.avgCycleTimeDays > 0 ? `${data.avgCycleTimeDays} days` : "N/A"}</p>
          <p className="text-xs text-jira-text-light mt-1">Requires In-Progress→Done history</p>
        </button>
        <button
          type="button"
          onClick={() => open("Avg Lead Time", "Completed work items (created → resolved)", done)}
          className="text-left bg-white border border-jira-border rounded-lg p-4 shadow-sm hover:border-jira-blue/50 transition"
        >
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Avg Lead Time</p>
          <p className="text-2xl font-bold text-jira-text mt-1">{data.avgLeadTimeDays} days</p>
          <p className="text-xs text-jira-text-light mt-1">From Request Created to Delivered</p>
        </button>
      </div>

      {/* Grid: Work Type Breakdown + Status Flow Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Work Item Types */}
        <div className="bg-white border border-jira-border rounded-lg p-5 shadow-sm">
          <h3 className="text-sm font-bold text-jira-text uppercase tracking-wider mb-4">
            Scope by Work Item Type
          </h3>
          <div className="space-y-3">
            {data.workTypeBreakdown.map((wt) => {
              const pct = totalItems > 0 ? Math.round((wt.count / totalItems) * 100) : 0;
              return (
                <button
                  key={wt.type}
                  type="button"
                  onClick={() =>
                    open(
                      `${wt.type} items`,
                      `${wt.count} items · ${wt.storyPoints} SP`,
                      issues.filter((i) => i.workType === wt.type)
                    )
                  }
                  className="w-full text-left space-y-1 rounded hover:bg-jira-bg/50 transition p-1"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-jira-text">{wt.type}</span>
                    <span className="text-xs text-jira-text-muted font-medium">
                      {wt.count} items • {wt.storyPoints} SP ({pct}%)
                    </span>
                  </div>
                  <div className="w-full bg-jira-bg h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-2 rounded-full ${
                        wt.type === "Bug"
                          ? "bg-jira-red"
                          : wt.type === "Story"
                          ? "bg-jira-blue"
                          : "bg-jira-green"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Workflow Status Distribution */}
        <div className="bg-white border border-jira-border rounded-lg p-5 shadow-sm">
          <h3 className="text-sm font-bold text-jira-text uppercase tracking-wider mb-4">
            Workflow Status Distribution
          </h3>
          <div className="space-y-3">
            {data.statusBreakdown.map((st) => {
              const pct = totalItems > 0 ? Math.round((st.count / totalItems) * 100) : 0;
              return (
                <button
                  key={st.status}
                  type="button"
                  onClick={() =>
                    open(
                      st.status,
                      `${st.count} items in ${st.status}`,
                      issues.filter((i) => i.status === st.status)
                    )
                  }
                  className="w-full text-left space-y-1 rounded hover:bg-jira-bg/50 transition p-1"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-jira-text flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: st.color }}
                      />
                      {st.status}
                    </span>
                    <span className="text-xs text-jira-text-muted font-medium">
                      {st.count} items ({pct}%)
                    </span>
                  </div>
                  <div className="w-full bg-jira-bg h-2 rounded-full overflow-hidden">
                    <div
                      className="h-2 rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: st.color }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
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

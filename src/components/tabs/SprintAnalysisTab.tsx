"use client";

import { SprintAnalysisData } from "@/lib/jira/types";

interface SprintAnalysisTabProps {
  data: SprintAnalysisData;
}

export function SprintAnalysisTab({ data }: SprintAnalysisTabProps) {
  const totalItems = data.statusBreakdown.reduce((a, b) => a + b.count, 0);

  return (
    <div className="space-y-6">
      {/* 4 Scope & Flow KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-jira-border rounded-lg p-4 shadow-sm">
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Sprint Scope Churn</p>
          <p className="text-2xl font-bold text-jira-amber mt-1">{data.scopeChurnPct}%</p>
          <p className="text-xs text-jira-text-light mt-1">Scope added/removed post start</p>
        </div>
        <div className="bg-white border border-jira-border rounded-lg p-4 shadow-sm">
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Planned Work Share</p>
          <p className="text-2xl font-bold text-jira-blue mt-1">{data.plannedWorkPct}%</p>
          <p className="text-xs text-jira-text-light mt-1">{data.unplannedWorkPct}% unplanned/emergency</p>
        </div>
        <div className="bg-white border border-jira-border rounded-lg p-4 shadow-sm">
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Avg Cycle Time</p>
          <p className="text-2xl font-bold text-jira-text mt-1">{data.avgCycleTimeDays} days</p>
          <p className="text-xs text-jira-text-light mt-1">From In Progress to Done</p>
        </div>
        <div className="bg-white border border-jira-border rounded-lg p-4 shadow-sm">
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Avg Lead Time</p>
          <p className="text-2xl font-bold text-jira-text mt-1">{data.avgLeadTimeDays} days</p>
          <p className="text-xs text-jira-text-light mt-1">From Request Created to Delivered</p>
        </div>
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
                <div key={wt.type} className="space-y-1">
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
                </div>
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
                <div key={st.status} className="space-y-1">
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
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}


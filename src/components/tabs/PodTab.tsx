"use client";

import { DashboardData } from "@/lib/jira/types";

interface PodTabProps {
  data: DashboardData;
  podName: string;
}

export function PodTab({ data, podName }: PodTabProps) {
  const { summary, sprintAnalysis, quality } = data;

  return (
    <div className="space-y-6">
      {/* Pod Overview Header */}
      <div className="bg-white border border-jira-border rounded-lg p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-jira-border pb-4 mb-4">
          <div>
            <h2 className="text-base font-bold text-jira-text">{podName}</h2>
            <p className="text-xs text-jira-text-muted mt-0.5">
              Service pod capacity, live progress, and health metrics
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 bg-jira-blue-bg text-jira-blue rounded-full border border-jira-blue/20 self-start sm:self-auto">
            {summary.totalStoryPoints} Total Story Points
          </span>
        </div>

        {/* 4 Pod Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-jira-bg rounded-lg border border-jira-border/50">
            <p className="text-xs uppercase text-jira-text-muted font-bold">Total Work Items</p>
            <p className="text-2xl font-bold text-jira-text mt-1">{summary.totalIssues}</p>
            <p className="text-[11px] text-jira-text-light mt-1">Scope in current filter</p>
          </div>
          <div className="p-4 bg-jira-bg rounded-lg border border-jira-border/50">
            <p className="text-xs uppercase text-jira-text-muted font-bold">Completed (Done)</p>
            <p className="text-2xl font-bold text-jira-green mt-1">{summary.completedIssues}</p>
            <p className="text-[11px] text-jira-text-light mt-1">{summary.completedStoryPoints} SP delivered</p>
          </div>
          <div className="p-4 bg-jira-bg rounded-lg border border-jira-border/50">
            <p className="text-xs uppercase text-jira-text-muted font-bold">In Flight</p>
            <p className="text-2xl font-bold text-jira-blue mt-1">{summary.inProgressIssues}</p>
            <p className="text-[11px] text-jira-text-light mt-1">Currently being worked</p>
          </div>
          <div className="p-4 bg-jira-bg rounded-lg border border-jira-border/50">
            <p className="text-xs uppercase text-jira-text-muted font-bold">Defect Density</p>
            <p className="text-2xl font-bold text-jira-amber mt-1">{quality.defectDensity}%</p>
            <p className="text-[11px] text-jira-text-light mt-1">{quality.totalBugs} bugs reported</p>
          </div>
        </div>
      </div>

      {/* Pod Work Composition & Statuses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Work items breakdown */}
        <div className="bg-white border border-jira-border rounded-lg p-5 shadow-sm">
          <h3 className="text-sm font-bold text-jira-text uppercase tracking-wider mb-4">
            Pod Workload Composition
          </h3>
          <div className="space-y-3">
            {sprintAnalysis.workTypeBreakdown.map((wt) => {
              const pct = summary.totalIssues > 0 ? Math.round((wt.count / summary.totalIssues) * 100) : 0;
              return (
                <div key={wt.type} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-jira-text">{wt.type}</span>
                    <span className="text-jira-text-muted">
                      {wt.count} items ({wt.storyPoints} SP) • {pct}%
                    </span>
                  </div>
                  <div className="w-full bg-jira-bg h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-2 rounded-full ${
                        wt.type === "Bug" ? "bg-jira-red" : wt.type === "Story" ? "bg-jira-blue" : "bg-jira-green"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Workflow State Distribution */}
        <div className="bg-white border border-jira-border rounded-lg p-5 shadow-sm">
          <h3 className="text-sm font-bold text-jira-text uppercase tracking-wider mb-4">
            Workflow Health & Distribution
          </h3>
          <div className="space-y-3">
            {sprintAnalysis.statusBreakdown.map((st) => {
              const pct = summary.totalIssues > 0 ? Math.round((st.count / summary.totalIssues) * 100) : 0;
              return (
                <div key={st.status} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-jira-text flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: st.color }} />
                      {st.status}
                    </span>
                    <span className="text-jira-text-muted">
                      {st.count} items ({pct}% of pod)
                    </span>
                  </div>
                  <div className="w-full bg-jira-bg h-2 rounded-full overflow-hidden">
                    <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: st.color }} />
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


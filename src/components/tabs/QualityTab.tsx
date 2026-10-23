"use client";

import { useState } from "react";
import { IssueRow, QualityData } from "@/lib/jira/types";
import { IssuesModal } from "@/components/IssuesModal";

interface QualityTabProps {
  data: QualityData;
  issues?: IssueRow[];
  jiraDomain?: string;
}

export function QualityTab({ data, issues = [], jiraDomain }: QualityTabProps) {
  const [modal, setModal] = useState<{
    title: string;
    subtitle: string;
    issues: IssueRow[];
  } | null>(null);

  const bugs = issues.filter((i) => i.workType === "Bug");
  const resolvedBugs = bugs.filter((i) => i.isDone);
  const open = (title: string, subtitle: string, list: IssueRow[]) =>
    setModal({ title, subtitle, issues: list });

  return (
    <div className="space-y-6">
      {/* Quality KPI Cards */}
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

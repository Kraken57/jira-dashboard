"use client";

import { QualityData } from "@/lib/jira/types";

interface QualityTabProps {
  data: QualityData;
}

export function QualityTab({ data }: QualityTabProps) {
  return (
    <div className="space-y-6">
      {/* Quality KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-jira-border rounded-lg p-4 shadow-sm">
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Defect Density</p>
          <p className="text-2xl font-bold text-jira-text mt-1">{data.defectDensity}</p>
          <p className="text-xs text-jira-text-light mt-1">Confirmed defects per 100 delivered SP</p>
        </div>
        <div className="bg-white border border-jira-border rounded-lg p-4 shadow-sm">
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Bug Resolution Rate</p>
          <p className="text-2xl font-bold text-jira-green mt-1">{data.resolutionRate}%</p>
          <p className="text-xs text-jira-text-light mt-1">{data.resolvedBugs} of {data.totalBugs} bugs resolved</p>
        </div>
        <div className="bg-white border border-jira-border rounded-lg p-4 shadow-sm">
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Resolution Time</p>
          <p className="text-2xl font-bold text-jira-blue mt-1">{data.avgResolutionDays} days</p>
          <p className="text-xs text-jira-text-light mt-1">Avg (Resolution − Created) for resolved defects</p>
        </div>
        <div className="bg-white border border-jira-border rounded-lg p-4 shadow-sm">
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Active Defects</p>
          <p className="text-2xl font-bold text-jira-amber mt-1">{data.totalBugs - data.resolvedBugs}</p>
          <p className="text-xs text-jira-text-light mt-1">Open bugs in current sprint</p>
        </div>
      </div>

      {/* Priority Distribution */}
      <div className="bg-white border border-jira-border rounded-lg p-5 shadow-sm">
        <h3 className="text-sm font-bold text-jira-text uppercase tracking-wider mb-4">
          Defect Severity & Priority Distribution
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {data.priorityDistribution.map((pd) => (
            <div key={pd.priority} className="p-4 bg-jira-bg rounded-lg border border-jira-border/60">
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
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


"use client";

import { DeveloperStat } from "@/lib/jira/types";

interface DeveloperTabProps {
  developers: DeveloperStat[];
  podName: string;
}

export function DeveloperTab({ developers, podName }: DeveloperTabProps) {
  const totalDevs = developers.length;
  const totalDelivered = developers.reduce((acc, d) => acc + d.deliveredSP, 0);
  const avgSP = totalDevs > 0 ? (totalDelivered / totalDevs).toFixed(1) : 0;
  const topDev = developers[0]?.name || "None";

  return (
    <div className="space-y-6">
      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-jira-border rounded-lg p-4 shadow-sm">
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Active Developers</p>
          <p className="text-2xl font-bold text-jira-text mt-1">{totalDevs}</p>
          <p className="text-xs text-jira-text-light mt-1">Contributing in {podName}</p>
        </div>
        <div className="bg-white border border-jira-border rounded-lg p-4 shadow-sm">
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Avg SP / Developer</p>
          <p className="text-2xl font-bold text-jira-blue mt-1">{avgSP} pts</p>
          <p className="text-xs text-jira-text-light mt-1">Delivered this period</p>
        </div>
        <div className="bg-white border border-jira-border rounded-lg p-4 shadow-sm">
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Total Delivered</p>
          <p className="text-2xl font-bold text-jira-green mt-1">{totalDelivered} SP</p>
          <p className="text-xs text-jira-text-light mt-1">Completed story points</p>
        </div>
        <div className="bg-white border border-jira-border rounded-lg p-4 shadow-sm">
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Top Contributor</p>
          <p className="text-2xl font-bold text-jira-text mt-1 truncate">{topDev}</p>
          <p className="text-xs text-jira-text-light mt-1">Highest story points delivered</p>
        </div>
      </div>

      {/* Developer Contribution Table */}
      <div className="bg-white border border-jira-border rounded-lg overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-jira-border flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-jira-text uppercase tracking-wider">Developer Contribution & Velocity</h3>
            <p className="text-xs text-jira-text-muted mt-0.5">Individual delivery metrics across issues and story points</p>
          </div>
          <span className="text-xs bg-jira-bg px-2.5 py-1 rounded text-jira-text-muted font-semibold">
            {developers.length} contributors
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-jira-bg text-jira-text-muted text-xs uppercase border-b border-jira-border font-semibold">
              <tr>
                <th className="px-6 py-3">Developer</th>
                <th className="px-6 py-3">Team / Service</th>
                <th className="px-6 py-3 text-center">Assigned</th>
                <th className="px-6 py-3 text-center">Completed</th>
                <th className="px-6 py-3 text-right">Story Points</th>
                <th className="px-6 py-3 text-right">Completion Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-jira-border/60">
              {developers.map((dev, idx) => (
                <tr key={dev.name + idx} className="hover:bg-jira-bg/30 transition-colors">
                  <td className="px-6 py-3 font-semibold text-jira-text flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-full bg-jira-blue-bg text-jira-blue flex items-center justify-center text-xs font-bold shrink-0">
                      {dev.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                    </span>
                    <span>{dev.name}</span>
                  </td>
                  <td className="px-6 py-3 text-xs text-jira-text-muted">{dev.team}</td>
                  <td className="px-6 py-3 text-center text-jira-text font-medium">{dev.assignedIssues}</td>
                  <td className="px-6 py-3 text-center text-jira-green font-semibold">{dev.completedIssues}</td>
                  <td className="px-6 py-3 text-right font-bold text-jira-blue">{dev.deliveredSP} SP</td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-20 bg-jira-bg rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-jira-blue h-1.5 rounded-full"
                          style={{ width: `${Math.min(dev.completionRate, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-jira-text w-9 text-right">
                        {dev.completionRate}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


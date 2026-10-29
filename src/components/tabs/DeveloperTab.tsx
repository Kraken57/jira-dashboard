"use client";

import { useState } from "react";
import { DeveloperStat, IssueRow } from "@/lib/jira/types";
import { IssuesModal } from "@/components/IssuesModal";

interface DeveloperTabProps {
  developers: DeveloperStat[];
  podName: string;
  developerFilter?: string;
  issues?: IssueRow[];
  jiraDomain?: string;
}

export function DeveloperTab({
  developers: allDevelopers,
  podName,
  developerFilter,
  issues = [],
  jiraDomain,
}: DeveloperTabProps) {
  // Alphabetical so people can find a developer quickly.
  const developers = [...allDevelopers]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(
      (d) =>
        !developerFilter ||
        developerFilter === "all" ||
        d.name === developerFilter
    );
  const totalDevs = developers.length;
  const totalDelivered = developers.reduce((acc, d) => acc + d.deliveredSP, 0);
  const totalAssignedSP = developers.reduce((acc, d) => acc + d.totalSP, 0);
  const totalAssigned = developers.reduce((acc, d) => acc + d.assignedIssues, 0);
  const totalCompleted = developers.reduce((acc, d) => acc + d.completedIssues, 0);
  const totalAssignedStories = developers.reduce((acc, d) => acc + d.assignedStories, 0);
  const totalAssignedSubtasks = developers.reduce((acc, d) => acc + d.assignedSubtasks, 0);
  const totalCompletedStories = developers.reduce((acc, d) => acc + d.completedStories, 0);
  const totalCompletedSubtasks = developers.reduce((acc, d) => acc + d.completedSubtasks, 0);
  const totalOriginalHours = Math.round(
    developers.reduce((acc, d) => acc + d.originalEstimateHours, 0) * 10
  ) / 10;
  const totalCompletedHours = Math.round(
    developers.reduce((acc, d) => acc + d.completedEstimateHours, 0) * 10
  ) / 10;
  const overallCompletion = totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 0;
  const avgSP = totalDevs > 0 ? (totalDelivered / totalDevs).toFixed(1) : 0;
  const scopedIssues =
    developerFilter && developerFilter !== "all"
      ? issues.filter((i) => i.assignee === developerFilter)
      : issues;

  const [modal, setModal] = useState<{
    title: string;
    subtitle: string;
    issues: IssueRow[];
  } | null>(null);

  const open = (title: string, subtitle: string, list: IssueRow[]) =>
    setModal({ title, subtitle, issues: list });

  return (
    <div className="space-y-6">
      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => open("Active Contributors", `${podName} · all assigned story and sub-task work`, scopedIssues)}
          className="text-left bg-white border border-jira-border rounded-lg p-4 shadow-sm hover:border-jira-blue/50 transition"
        >
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Active Contributors</p>
          <p className="text-2xl font-bold text-jira-text mt-1">{totalDevs}</p>
          <p className="text-xs text-jira-text-light mt-1">Contributing in {podName}</p>
        </button>
        <button
          type="button"
          onClick={() =>
            open(
              "Avg SP / Developer",
              `${podName} · completed work items`,
              scopedIssues.filter((i) => i.isDone)
            )
          }
          className="text-left bg-white border border-jira-border rounded-lg p-4 shadow-sm hover:border-jira-blue/50 transition"
        >
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Avg SP / Developer</p>
          <p className="text-2xl font-bold text-jira-blue mt-1">{avgSP} pts</p>
          <p className="text-xs text-jira-text-light mt-1">Delivered this period</p>
        </button>
        <button
          type="button"
          onClick={() =>
            open(
              "Total Delivered",
              `${podName} · completed work items`,
              scopedIssues.filter((i) => i.isDone)
            )
          }
          className="text-left bg-white border border-jira-border rounded-lg p-4 shadow-sm hover:border-jira-green/50 transition"
        >
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Total Delivered</p>
          <p className="text-2xl font-bold text-jira-green mt-1">{totalDelivered} SP</p>
          <p className="text-xs text-jira-text-light mt-1">Completed story points</p>
        </button>
        <button
          type="button"
          onClick={() =>
            open(
              "Throughput",
              `${podName} · completed work items`,
              scopedIssues.filter((i) => i.isDone)
            )
          }
          className="text-left bg-white border border-jira-border rounded-lg p-4 shadow-sm hover:border-jira-amber/50 transition"
        >
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Throughput</p>
          <p className="text-2xl font-bold text-jira-text mt-1">
            {totalDevs > 0 ? (totalDelivered / totalDevs).toFixed(1) : 0} SP
          </p>
          <p className="text-xs text-jira-text-light mt-1">
            Delivered SP ÷ {totalDevs} contributors
          </p>
        </button>
      </div>

      {/* Developer Contribution Table */}
      <div className="bg-white border border-jira-border rounded-lg overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-jira-border flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-jira-text uppercase tracking-wider">Developer Contribution & Velocity</h3>
            <p className="text-xs text-jira-text-muted mt-0.5">Story and sub-task delivery, story points, and original estimate hours</p>
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
                <th className="px-6 py-3 text-center">
                  <span className="block">Assigned Work</span>
                  <span className="block text-[10px] font-medium normal-case tracking-normal text-jira-text-light">
                    Story / Sub-Task
                  </span>
                </th>
                <th className="px-6 py-3 text-center">
                  <span className="block">Completed</span>
                  <span className="block text-[10px] font-medium normal-case tracking-normal text-jira-text-light">
                    Story / Sub-Task completed
                  </span>
                </th>
                <th className="px-6 py-3 text-right">
                  <span className="block">Story Points</span>
                  <span className="block text-[10px] font-medium normal-case tracking-normal text-jira-text-light">
                    Delivered / Assigned
                  </span>
                </th>
                <th className="px-6 py-3 text-right">
                  <span className="block">Hours</span>
                  <span className="block text-[10px] font-medium normal-case tracking-normal text-jira-text-light">
                    Completed / Original estimate
                  </span>
                </th>
                <th className="px-6 py-3 text-right">Completion Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-jira-border/60">
              {developers.map((dev, idx) => (
                <tr
                  key={dev.name + idx}
                  onClick={() =>
                    open(
                      `Work items · ${dev.name}`,
                      `${dev.assignedIssues} story/sub-task items · ${dev.completedIssues} completed · ${dev.deliveredSP} SP delivered`,
                      issues.filter((i) => i.assignee === dev.name)
                    )
                  }
                  className="transition-colors cursor-pointer hover:bg-jira-bg"
                >
                  <td className="px-6 py-3 font-semibold text-jira-text flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-full bg-jira-blue-bg text-jira-blue flex items-center justify-center text-xs font-bold shrink-0">
                      {dev.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                    </span>
                    <span>{dev.name}</span>
                  </td>
                  <td className="px-6 py-3 text-xs text-jira-text-muted">{dev.team}</td>
                  <td className="px-6 py-3 text-center">
                    <p className="text-sm font-semibold text-jira-text">{dev.assignedIssues}</p>
                    <p className="text-[11px] text-jira-text-muted mt-0.5">
                      <span className="font-semibold text-jira-blue">{dev.assignedStories}</span> stories ·{" "}
                      <span className="font-semibold text-jira-amber">{dev.assignedSubtasks}</span> sub-tasks
                    </p>
                  </td>
                  <td className="px-6 py-3 text-center">
                    <p className="text-sm font-semibold text-jira-green">{dev.completedIssues}</p>
                    <p className="text-[11px] text-jira-text-muted mt-0.5">
                      <span className="font-semibold text-jira-green">{dev.completedStories}</span> stories ·{" "}
                      <span className="font-semibold text-jira-green">{dev.completedSubtasks}</span> sub-tasks
                    </p>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <p className="text-sm font-bold text-jira-blue">{dev.deliveredSP} SP</p>
                    <p className="text-[11px] text-jira-text-muted mt-0.5">
                      of <span className="font-semibold text-jira-text">{dev.totalSP} SP</span> assigned
                    </p>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <p className="text-sm font-bold text-jira-green">{dev.completedEstimateHours} hrs</p>
                    <p className="text-[11px] text-jira-text-muted mt-0.5">
                      of <span className="font-semibold text-jira-text">{dev.originalEstimateHours} hrs</span> original
                    </p>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-20 bg-jira-bg rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-1.5 rounded-full ${
                            dev.completionRate >= 80
                              ? "bg-jira-green"
                              : dev.completionRate >= 50
                              ? "bg-jira-blue"
                              : "bg-jira-amber"
                          }`}
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
            <tfoot className="bg-jira-bg/60 border-t-2 border-jira-border text-xs">
              <tr className="font-semibold text-jira-text">
                <td className="px-6 py-3" colSpan={2}>
                  Team total
                </td>
                <td className="px-6 py-3 text-center">
                  {totalAssigned}
                  <p className="text-[11px] font-normal text-jira-text-muted mt-0.5">
                    {totalAssignedStories} stories · {totalAssignedSubtasks} sub-tasks
                  </p>
                </td>
                <td className="px-6 py-3 text-center text-jira-green">
                  {totalCompleted}
                  <p className="text-[11px] font-normal text-jira-text-muted mt-0.5">
                    {totalCompletedStories} stories · {totalCompletedSubtasks} sub-tasks
                  </p>
                </td>
                <td className="px-6 py-3 text-right text-jira-blue">
                  {totalDelivered} / {totalAssignedSP} SP
                </td>
                <td className="px-6 py-3 text-right text-jira-green">
                  {totalCompletedHours} / {totalOriginalHours} hrs
                </td>
                <td className="px-6 py-3 text-right">{overallCompletion}%</td>
              </tr>
            </tfoot>
          </table>
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


"use client";

import { useState } from "react";
import { Pie } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { DashboardData, IssueRow } from "@/lib/jira/types";
import { IssuesModal } from "@/components/IssuesModal";

ChartJS.register(ArcElement, Tooltip, Legend);

const PIE_COLORS = [
  "#2563eb", // blue
  "#16a34a", // green
  "#f59e0b", // amber
  "#dc2626", // red
  "#7c3aed", // violet
  "#0891b2", // cyan
  "#ea580c", // orange
  "#db2777", // pink
  "#4f46e5", // indigo
  "#65a30d", // lime
  "#0d9488", // teal
  "#9333ea", // purple
];

interface PodTabProps {
  data: DashboardData;
  podName: string;
}

export function PodTab({ data, podName }: PodTabProps) {
  const { summary, sprintAnalysis } = data;
  const issues = data.issueList;

  const isFeatureType = (i: IssueRow) => /^feature$/i.test(i.workType);
  const isEpicType = (i: IssueRow) => /^epic$/i.test(i.workType);
  // Sites without a Feature issue type track feature-level work as Epics.
  // podFeatureList keeps features visible when a quarter/sprint is selected,
  // because features usually have no quarter/sprint field of their own.
  const featureSource = data.podFeatureList ?? issues;
  const features = featureSource.some(isFeatureType)
    ? featureSource.filter(isFeatureType)
    : featureSource.filter(isEpicType);
  const stories = issues.filter((i) => /^story$/i.test(i.workType));
  const completedFeatures = features.filter((i) => i.isDone);
  const completedStories = stories.filter((i) => i.isDone);
  const openStories = stories.filter((i) => !i.isDone);
  const storySP = stories.reduce((sum, i) => sum + (i.storyPoints || 0), 0);
  const completedStorySP = completedStories.reduce((sum, i) => sum + (i.storyPoints || 0), 0);
  const openStorySP = openStories.reduce((sum, i) => sum + (i.storyPoints || 0), 0);
  const storyCompletionPct = stories.length
    ? Math.round((completedStories.length / stories.length) * 100)
    : 0;
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [modal, setModal] = useState<{
    title: string;
    subtitle: string;
    issues: IssueRow[];
  } | null>(null);

  const open = (title: string, subtitle: string, list: IssueRow[]) =>
    setModal({ title, subtitle, issues: list });

  const activeType =
    selectedType &&
    sprintAnalysis.workTypeBreakdown.some((wt) => wt.type === selectedType)
      ? selectedType
      : sprintAnalysis.workTypeBreakdown[0]?.type ?? null;

  const typeIssues = activeType
    ? issues.filter((i) => i.workType === activeType)
    : [];

  const statusCounts = new Map<string, { count: number; isDone: boolean }>();
  typeIssues.forEach((i) => {
    const current = statusCounts.get(i.status) || { count: 0, isDone: i.isDone };
    current.count += 1;
    statusCounts.set(i.status, current);
  });

  const typeStatuses = Array.from(statusCounts.entries())
    .map(([status, stat]) => ({ status, count: stat.count }))
    .sort((a, b) => b.count - a.count)
    .map((stat, index) => ({
      ...stat,
      color: PIE_COLORS[index % PIE_COLORS.length],
    }));

  const openStatus = (status: string) =>
    open(
      `${activeType} · ${status}`,
      `${podName} · ${status} items`,
      typeIssues.filter((i) => i.status === status)
    );

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
          <button
            type="button"
            onClick={() =>
              open("Total Features", `${podName} · feature-level items in pod`, features)
            }
            className="text-left p-4 bg-jira-bg rounded-lg border border-jira-border/50 hover:border-jira-blue/50 hover:shadow-sm transition"
          >
            <p className="text-xs uppercase text-jira-text-muted font-bold">Total Features</p>
            <p className="text-2xl font-bold text-jira-text mt-1">{features.length}</p>
            <p className="text-[11px] text-jira-text-light mt-1">
              {completedFeatures.length} completed · {features.length - completedFeatures.length} open
            </p>
          </button>
          <button
            type="button"
            onClick={() => open("Total Stories", `${podName} · all stories in scope`, stories)}
            className="text-left p-4 bg-jira-bg rounded-lg border border-jira-border/50 hover:border-jira-blue/50 hover:shadow-sm transition"
          >
            <p className="text-xs uppercase text-jira-text-muted font-bold">Total Stories</p>
            <p className="text-2xl font-bold text-jira-text mt-1">{stories.length}</p>
            <p className="text-[11px] text-jira-text-light mt-1">
              {storySP} SP · {completedStories.length} completed
            </p>
          </button>
          <button
            type="button"
            onClick={() =>
              open("Completed Stories", `${podName} · accepted stories`, completedStories)
            }
            className="text-left p-4 bg-jira-bg rounded-lg border border-jira-border/50 hover:border-jira-green/50 hover:shadow-sm transition"
          >
            <p className="text-xs uppercase text-jira-text-muted font-bold">Completed Stories</p>
            <p className="text-2xl font-bold text-jira-green mt-1">{completedStories.length}</p>
            <p className="text-[11px] text-jira-text-light mt-1">
              {completedStorySP} SP delivered · {storyCompletionPct}% of stories
            </p>
          </button>
          <button
            type="button"
            onClick={() =>
              open("In Flight", `${podName} · stories still open`, openStories)
            }
            className="text-left p-4 bg-jira-bg rounded-lg border border-jira-border/50 hover:border-jira-amber/50 hover:shadow-sm transition"
          >
            <p className="text-xs uppercase text-jira-text-muted font-bold">In Flight</p>
            <p className="text-2xl font-bold text-jira-amber mt-1">{openStories.length}</p>
            <p className="text-[11px] text-jira-text-light mt-1">
              {openStorySP} SP open · {100 - storyCompletionPct}% of stories
            </p>
          </button>
        </div>
      </div>

      {/* Pod Work Composition & Workflow Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Work items breakdown */}
        <div className="bg-white border border-jira-border rounded-lg p-5 shadow-sm">
          <h3 className="text-sm font-bold text-jira-text uppercase tracking-wider mb-4">
            Pod Workload Composition
          </h3>
          <div className="space-y-3">
            {sprintAnalysis.workTypeBreakdown.map((wt) => {
              const pct = summary.totalIssues > 0 ? Math.round((wt.count / summary.totalIssues) * 100) : 0;
              return (
                <button
                  key={wt.type}
                  type="button"
                  onClick={() => setSelectedType(wt.type)}
                  aria-pressed={activeType === wt.type}
                  className={`w-full text-left space-y-1 rounded-md border p-2 transition ${
                    activeType === wt.type
                      ? "border-jira-blue/40 bg-jira-blue-bg/60"
                      : "border-transparent hover:bg-jira-bg/60"
                  }`}
                >
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
                </button>
              );
            })}
          </div>
        </div>

        {/* Workflow Progress for the selected work type */}
        <div className="bg-white border border-jira-border rounded-lg p-5 shadow-sm flex flex-col">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="text-sm font-bold text-jira-text uppercase tracking-wider">
                Workflow Progress
              </h3>
              <p className="text-xs text-jira-text-muted mt-0.5">
                {activeType
                  ? `${activeType} · ${typeIssues.length} items`
                  : "Select a work type on the left"}
              </p>
            </div>
            {activeType && (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-jira-blue-bg text-jira-blue border border-jira-blue/20 shrink-0">
                {typeStatuses.length} statuses
              </span>
            )}
          </div>

          {activeType && typeIssues.length > 0 ? (
            <>
              <div className="relative h-56 min-w-0">
                <Pie
                  data={{
                    labels: typeStatuses.map((s) => s.status),
                    datasets: [
                      {
                        data: typeStatuses.map((s) => s.count),
                        backgroundColor: typeStatuses.map((s) => s.color),
                        borderColor: "#ffffff",
                        borderWidth: 2,
                        hoverOffset: 10,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: 4 },
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          label: (ctx) => {
                            const value = Number(ctx.raw) || 0;
                            const pct = typeIssues.length
                              ? Math.round((value / typeIssues.length) * 100)
                              : 0;
                            return ` ${ctx.label}: ${value} (${pct}%)`;
                          },
                        },
                      },
                    },
                    onHover: (event, elements) => {
                      const target = event.native?.target as HTMLElement | undefined;
                      if (target) {
                        target.style.cursor = elements.length ? "pointer" : "default";
                      }
                    },
                    onClick: (_event, elements) => {
                      const index = elements[0]?.index;
                      if (index === undefined) return;
                      const status = typeStatuses[index]?.status;
                      if (status) openStatus(status);
                    },
                  }}
                />
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {typeStatuses.map((s) => (
                  <button
                    key={s.status}
                    type="button"
                    onClick={() => openStatus(s.status)}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-jira-bg transition"
                    title={`Open ${s.count} ${activeType} items in ${s.status}`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="text-xs text-jira-text truncate">{s.status}</span>
                    <span className="ml-auto text-[11px] font-semibold text-jira-text-muted">
                      {s.count}
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-xs text-jira-text-muted py-10">
              {activeType
                ? "No work items for this type in the current filter."
                : "Select a work type to see its workflow progress."}
            </div>
          )}
        </div>
      </div>

      {modal && (
        <IssuesModal
          title={modal.title}
          subtitle={modal.subtitle}
          issues={modal.issues}
          jiraDomain={data.jiraBaseUrl}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

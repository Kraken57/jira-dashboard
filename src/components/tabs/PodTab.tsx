"use client";

import { useState } from "react";
import { DashboardData, IssueRow } from "@/lib/jira/types";
import { IssuesModal } from "@/components/IssuesModal";

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
  const features = issues.some(isFeatureType)
    ? issues.filter(isFeatureType)
    : issues.filter(isEpicType);
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
  const [modal, setModal] = useState<{
    title: string;
    subtitle: string;
    issues: IssueRow[];
  } | null>(null);

  const open = (title: string, subtitle: string, list: IssueRow[]) =>
    setModal({ title, subtitle, issues: list });

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
              open("Total Features", `${podName} · feature-level items in scope`, features)
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
                <button
                  key={wt.type}
                  type="button"
                  onClick={() =>
                    open(
                      `${wt.type} items`,
                      `${podName} · ${wt.count} items · ${wt.storyPoints} SP`,
                      issues.filter((i) => i.workType === wt.type)
                    )
                  }
                  className="w-full text-left space-y-1 rounded hover:bg-jira-bg/50 transition p-1"
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

        {/* Workflow State Distribution */}
        <div className="bg-white border border-jira-border rounded-lg p-5 shadow-sm">
          <h3 className="text-sm font-bold text-jira-text uppercase tracking-wider mb-4">
            Workflow Health & Distribution
          </h3>
          <div className="space-y-3">
            {sprintAnalysis.statusBreakdown.map((st) => {
              const pct = summary.totalIssues > 0 ? Math.round((st.count / summary.totalIssues) * 100) : 0;
              return (
                <button
                  key={st.status}
                  type="button"
                  onClick={() =>
                    open(
                      st.status,
                      `${podName} · ${st.count} items in ${st.status}`,
                      issues.filter((i) => i.status === st.status)
                    )
                  }
                  className="w-full text-left space-y-1 rounded hover:bg-jira-bg/50 transition p-1"
                >
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
          jiraDomain={data.jiraBaseUrl}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

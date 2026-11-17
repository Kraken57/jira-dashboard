"use client";

import { featureDelivery } from "@/lib/jira/featureDelivery";
import { DetailModal } from "./DetailModal";
import { JiraWorkLink } from "./JiraWorkLink";
import { IssueRow, JiraWorkItem } from "@/lib/jira/types";
import { useMemo, useState } from "react";

type FeatureStatusFilter = "All" | "Delivered" | "In Progress" | "Past Due Date" | "No stories";
type ProjectType = "All" | "ENH" | "PRJ" | "None";

function getProjectType(fixVersions?: string[]): Exclude<ProjectType, "All"> {
  const versions = (fixVersions || []).map((version) => version.trim()).filter(Boolean);
  if (!versions.length) return "None";
  const isEnhancement = versions.some((version) =>
    version.toLocaleLowerCase().replace(/[\s-]/g, "") === "enhancementsenterpriseservices"
  );
  return isEnhancement ? "ENH" : "PRJ";
}

export function FeatureDetailsModal({ features, items, doneStatuses, jiraDomain, onClose }: {
  features: IssueRow[];
  items: JiraWorkItem[];
  doneStatuses: string[];
  jiraDomain?: string;
  onClose: () => void;
}) {
  const byKey = new Map(items.map((item) => [item.key, item]));
  const [statusFilter, setStatusFilter] = useState<FeatureStatusFilter>("All");
  const [projectTypeFilter, setProjectTypeFilter] = useState<ProjectType>("All");
  const rows = useMemo(() => features.map((feature) => {
    const detail = byKey.get(feature.key) ? featureDelivery(byKey.get(feature.key)!, items, doneStatuses) : null;
    return { feature, detail, status: detail?.status ?? "No stories", projectType: getProjectType(feature.fixVersions) };
  }), [features, items, doneStatuses]);
  const counts = rows.reduce((result, row) => {
    const key = row.status === "Delivered" ? "completed" : row.status === "In Progress" ? "inProgress" : row.status === "Past Due Date" ? "pastDue" : "noStories";
    result[key]++;
    return result;
  }, { completed: 0, inProgress: 0, pastDue: 0, noStories: 0 });
  const deliveredAverage = (projectType: Exclude<ProjectType, "All">) => {
    const delivered = rows.filter((row) => row.status === "Delivered" && row.projectType === projectType);
    return {
      count: delivered.length,
      storyPoints: delivered.length
        ? Math.round(delivered.reduce((sum, row) => sum + (row.detail?.storyPoints || 0), 0) / delivered.length * 10) / 10
        : null,
      hours: delivered.length
        ? Math.round(delivered.reduce((sum, row) => sum + (row.detail?.hours || 0), 0) / delivered.length * 10) / 10
        : null,
    };
  };
  const enhancementAverage = deliveredAverage("ENH");
  const projectAverage = deliveredAverage("PRJ");
  const visibleRows = rows.filter((row) =>
    (statusFilter === "All" || row.status === statusFilter) &&
    (projectTypeFilter === "All" || row.projectType === projectTypeFilter)
  );
  return (
    <DetailModal title="Feature Predictability" subtitle={`${features.length} features · Delivery and timeline status`} onClose={onClose} wide bodyClassName="min-h-0 overflow-y-auto overscroll-contain">
      <div className="p-4">
        <div className="mb-4 rounded-md border border-jira-border bg-slate-50 p-3 text-xs leading-relaxed text-jira-text-muted">
          <p className="font-semibold text-jira-text">How this is calculated</p>
          <p className="mt-1">A feature is delivered when all its child stories are complete by the due date. It is in progress while stories remain and the due date has not passed. Features without a due date count as predictable; overdue unfinished features are past due.</p>
          <p className="mt-1">Story points, completed story count, and logged hours are rolled up from the feature’s stories and subtasks.</p>
        </div>
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[
            ["Enhancement (avg efforts spent)", enhancementAverage],
            ["Project (avg efforts spent)", projectAverage],
          ].map(([label, average]) => {
            const value = average as typeof enhancementAverage;
            return <div key={label as string} className="rounded-md border border-jira-border bg-white px-3 py-2.5">
              <div className="text-[11px] font-semibold text-jira-text-muted">{label as string}</div>
              <div className="mt-1 text-base font-semibold tabular-nums text-jira-text">
                {value.count ? `${value.storyPoints} SP · ${value.hours} h` : "N/A"}
              </div>
              <div className="mt-0.5 text-[10px] text-jira-text-muted">
                Average story points and logged hours per delivered feature · {value.count} features
              </div>
            </div>;
          })}
        </div>
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[["Total features", rows.length], ["Completed", counts.completed], ["In progress", counts.inProgress], ["Past due", counts.pastDue]].map(([label, value]) => <div key={label} className="rounded-md border border-jira-border bg-white px-3 py-2"><div className="text-[11px] font-medium text-jira-text-muted">{label}</div><div className="text-lg font-semibold text-jira-text">{value}</div></div>)}
        </div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-jira-text-muted">{counts.noStories} features have no child stories</p>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 text-xs font-medium text-jira-text-muted">Status
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as FeatureStatusFilter)} className="rounded border border-jira-border bg-white px-2 py-1.5 text-jira-text">
                {(["All", "Delivered", "In Progress", "Past Due Date", "No stories"] as FeatureStatusFilter[]).map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-jira-text-muted">Project type
              <select value={projectTypeFilter} onChange={(event) => setProjectTypeFilter(event.target.value as ProjectType)} className="rounded border border-jira-border bg-white px-2 py-1.5 text-jira-text">
                {(["All", "ENH", "PRJ", "None"] as ProjectType[]).map((type) => <option key={type} value={type}>{type === "All" ? "All types" : type}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-jira-border">
        <table className="w-full min-w-[760px] table-fixed text-left text-xs">
          <colgroup><col className="w-[12%]" /><col className="w-[12%]" /><col className="w-[27%]" /><col className="w-[13%]" /><col className="w-[11%]" /><col className="w-[10%]" /><col className="w-[15%]" /></colgroup>
          <thead className="sticky top-0 z-10 bg-slate-50"><tr>{["Key", "Project type", "Summary", "Due date", "Story points", "Hours", "Status"].map((label) => <th key={label} className="px-2 py-3 border-b font-semibold">{label}</th>)}</tr></thead>
          <tbody>{visibleRows.map(({ feature, detail, status }) => {
            const stories = detail?.stories ?? [];
            const completedStoryPoints = stories
              .filter((story) => doneStatuses.includes(story.status))
              .reduce((sum, story) => sum + (story.storyPoints || 0), 0);
            const hours = detail?.hours ?? 0;
            return <tr key={feature.key} className="border-b hover:bg-slate-50 [&>td]:px-2 [&>td]:py-3">
              <td><JiraWorkLink issueKey={feature.key} jiraDomain={jiraDomain}>{feature.key}</JiraWorkLink></td>
              <td><span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold tracking-wide ${feature.fixVersions?.length ? getProjectType(feature.fixVersions) === "ENH" ? "bg-violet-100 text-violet-800" : "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600"}`} title={feature.fixVersions?.join(", ") || "No Fix Version"}>{getProjectType(feature.fixVersions)}</span></td>
              <td className="truncate" title={feature.summary}>{feature.summary || "—"}</td>
              <td className="whitespace-nowrap tabular-nums">{feature.dueDate?.slice(0, 10) || "No due date"}</td>
              <td className="tabular-nums">{detail?.storyPoints ?? 0}</td><td className="tabular-nums">{hours}</td>
              <td className={`font-semibold ${status === "Past Due Date" ? "text-red-600" : status === "Delivered" ? "text-green-700" : "text-slate-600"}`}>
                {status} <span className="font-normal tabular-nums">({completedStoryPoints}/{detail?.storyPoints ?? 0} SP)</span>
              </td>
            </tr>;
          })}</tbody>
        </table>
        {!visibleRows.length && <p className="p-4 text-sm text-jira-text-muted">No features match these filters.</p>}
        </div>
      </div>
    </DetailModal>
  );
}

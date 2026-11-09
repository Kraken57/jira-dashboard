"use client";

import { featureDelivery } from "@/lib/jira/featureDelivery";
import { DetailModal } from "./DetailModal";
import { IssueRow, JiraWorkItem } from "@/lib/jira/types";
import { useMemo, useState } from "react";

type FeatureStatusFilter = "All" | "Delivered" | "In Progress" | "Past Due Date" | "No stories";

export function FeatureDetailsModal({ features, items, doneStatuses, jiraDomain, onClose }: {
  features: IssueRow[];
  items: JiraWorkItem[];
  doneStatuses: string[];
  jiraDomain?: string;
  onClose: () => void;
}) {
  const byKey = new Map(items.map((item) => [item.key, item]));
  const [statusFilter, setStatusFilter] = useState<FeatureStatusFilter>("All");
  const rows = useMemo(() => features.map((feature) => {
    const detail = byKey.get(feature.key) ? featureDelivery(byKey.get(feature.key)!, items, doneStatuses) : null;
    return { feature, detail, status: detail?.status ?? "No stories" };
  }), [features, items, doneStatuses]);
  const counts = rows.reduce((result, row) => {
    const key = row.status === "Delivered" ? "completed" : row.status === "In Progress" ? "inProgress" : row.status === "Past Due Date" ? "pastDue" : "noStories";
    result[key]++;
    return result;
  }, { completed: 0, inProgress: 0, pastDue: 0, noStories: 0 });
  const visibleRows = statusFilter === "All" ? rows : rows.filter((row) => row.status === statusFilter);
  return (
    <DetailModal title="Feature Predictability" subtitle={`${features.length} features · Delivery and timeline status`} onClose={onClose} wide bodyClassName="min-h-0 overflow-y-auto overscroll-contain">
      <div className="p-4">
        <div className="mb-4 rounded-md border border-jira-border bg-slate-50 p-3 text-xs leading-relaxed text-jira-text-muted">
          <p className="font-semibold text-jira-text">How this is calculated</p>
          <p className="mt-1">A feature is delivered when all its child stories are complete by the due date. It is in progress while stories remain and the due date has not passed. Features without a due date count as predictable; overdue unfinished features are past due.</p>
          <p className="mt-1">Story points, completed story count, and logged hours are rolled up from the feature’s stories and subtasks.</p>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[["Total features", rows.length], ["Completed", counts.completed], ["In progress", counts.inProgress], ["Past due", counts.pastDue]].map(([label, value]) => <div key={label} className="rounded-md border border-jira-border bg-white px-3 py-2"><div className="text-[11px] font-medium text-jira-text-muted">{label}</div><div className="text-lg font-semibold text-jira-text">{value}</div></div>)}
        </div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-jira-text-muted">{counts.noStories} features have no child stories</p>
          <label className="flex items-center gap-2 text-xs font-medium text-jira-text-muted">Filter status
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as FeatureStatusFilter)} className="rounded border border-jira-border bg-white px-2 py-1.5 text-jira-text">
              {(["All", "Delivered", "In Progress", "Past Due Date", "No stories"] as FeatureStatusFilter[]).map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
        </div>
        <table className="w-full table-fixed text-left text-xs">
          <colgroup><col className="w-[13%]" /><col className="w-[31%]" /><col className="w-[12%]" /><col className="w-[12%]" /><col className="w-[11%]" /><col className="w-[21%]" /></colgroup>
          <thead className="sticky top-0 z-10 bg-slate-50"><tr>{["Key", "Summary", "Due date", "Story points", "Hours", "Status"].map((label) => <th key={label} className="px-2 py-3 border-b font-semibold">{label}</th>)}</tr></thead>
          <tbody>{visibleRows.map(({ feature, detail, status }) => {
            const stories = detail?.stories ?? [];
            const completed = detail?.completed ?? 0;
            const hours = detail?.hours ?? 0;
            return <tr key={feature.key} className="border-b hover:bg-slate-50 [&>td]:px-2 [&>td]:py-3">
              <td><a className="block truncate font-medium text-jira-blue" title={feature.key} href={jiraDomain ? `${jiraDomain}/browse/${feature.key}` : undefined} target="_blank" rel="noreferrer">{feature.key}</a></td>
              <td className="truncate" title={feature.summary}>{feature.summary || "—"}</td>
              <td className="whitespace-nowrap tabular-nums">{feature.dueDate?.slice(0, 10) || "No due date"}</td>
              <td className="tabular-nums">{detail?.storyPoints ?? 0}</td><td className="tabular-nums">{hours}</td>
              <td className={`font-semibold ${status === "Past Due Date" ? "text-red-600" : status === "Delivered" ? "text-green-700" : "text-slate-600"}`}>{status}</td>
            </tr>;
          })}</tbody>
        </table>
        {!features.length && <p className="p-4 text-sm text-jira-text-muted">No features in the selected scope.</p>}
      </div>
    </DetailModal>
  );
}

"use client";

import { featureDelivery } from "@/lib/jira/featureDelivery";
import { DetailModal } from "./DetailModal";
import { IssueRow, JiraWorkItem } from "@/lib/jira/types";

export function FeatureDetailsModal({ features, items, doneStatuses, jiraDomain, onClose }: {
  features: IssueRow[];
  items: JiraWorkItem[];
  doneStatuses: string[];
  jiraDomain?: string;
  onClose: () => void;
}) {
  const byKey = new Map(items.map((item) => [item.key, item]));
  return (
    <DetailModal title="Feature Predictability" subtitle={`${features.length} features · Delivery and timeline status`} onClose={onClose} wide bodyClassName="min-h-0 overflow-y-auto overscroll-contain">
      <div className="p-4">
        <div className="mb-4 rounded-md border border-jira-border bg-slate-50 p-3 text-xs leading-relaxed text-jira-text-muted">
          <p className="font-semibold text-jira-text">How this is calculated</p>
          <p className="mt-1">The score is predictable features divided by all features in the selected scope. A feature is predictable when all its child stories are complete by the due date, or it is still in progress and the due date has not passed. Features without a due date count as predictable. Overdue unfinished features and features completed after the due date are not predictable.</p>
          <p className="mt-1">Story points, completed story count, and logged hours are rolled up from the feature’s stories and subtasks.</p>
        </div>
        <table className="w-full table-fixed text-left text-xs">
          <colgroup><col className="w-[14%]" /><col className="w-[12%]" /><col className="w-[10%]" /><col className="w-[12%]" /><col className="w-[14%]" /><col className="w-[18%]" /><col className="w-[20%]" /></colgroup>
          <thead className="sticky top-0 z-10 bg-slate-50"><tr>{["Feature", "Due date", "Story points", "Hours logged", "Stories done", "Delivery status", "Predictability"].map((label) => <th key={label} className="px-2 py-3 border-b font-semibold">{label}</th>)}</tr></thead>
          <tbody>{features.map((feature) => {
            const source = byKey.get(feature.key);
            const detail = source ? featureDelivery(source, items, doneStatuses) : null;
            const stories = detail?.stories ?? [];
            const completed = detail?.completed ?? 0;
            const hours = detail?.hours ?? 0;
            const status = detail?.status ?? "No stories";
            return <tr key={feature.key} className="border-b hover:bg-slate-50 [&>td]:px-2 [&>td]:py-3">
              <td><a className="block truncate font-medium text-jira-blue" title={feature.key} href={jiraDomain ? `${jiraDomain}/browse/${feature.key}` : undefined} target="_blank" rel="noreferrer">{feature.key}</a></td>
              <td className="whitespace-nowrap tabular-nums">{feature.dueDate?.slice(0, 10) || "No due date"}</td>
              <td className="tabular-nums">{detail?.storyPoints ?? 0}</td><td className="tabular-nums">{hours}</td><td className="tabular-nums" title="Completed stories / total stories">{completed}/{stories.length}</td>
              <td className={`font-semibold ${status === "Past Due Date" ? "text-red-600" : status === "Delivered" ? "text-green-700" : "text-slate-600"}`}>{status}</td>
              <td title={!feature.dueDate ? "No due date — counted as predictable" : undefined}>{!detail ? "Unavailable" : detail.predictable ? "Predictable" : status === "No stories" ? "No story data" : "Not predictable"}</td>
            </tr>;
          })}</tbody>
        </table>
        {!features.length && <p className="p-4 text-sm text-jira-text-muted">No features in the selected scope.</p>}
      </div>
    </DetailModal>
  );
}

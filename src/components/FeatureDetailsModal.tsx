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
    <DetailModal title="Feature Predictability" subtitle="On-time delivered features and unfinished features within their due date count as predictable. Features without stories, due dates, or required completion dates are excluded." onClose={onClose} wide>
      <div className="overflow-x-auto p-4">
        <table className="w-full whitespace-nowrap text-left text-sm">
          <thead><tr>{["Feature", "Start date", "Due date", "Story points", "Hours logged", "Completed / total stories", "Delivery status", "Predictability"].map((label) => <th key={label} className="p-3 border-b font-semibold">{label}</th>)}</tr></thead>
          <tbody>{features.map((feature) => {
            const source = byKey.get(feature.key);
            const detail = source ? featureDelivery(source, items, doneStatuses) : null;
            const stories = detail?.stories ?? [];
            const completed = detail?.completed ?? 0;
            const hours = detail?.hours ?? 0;
            const status = detail?.status ?? "No stories";
            return <tr key={feature.key} className="border-b">
              <td className="p-3"><a className="text-jira-blue" href={jiraDomain ? `${jiraDomain}/browse/${feature.key}` : undefined} target="_blank" rel="noreferrer">{feature.key}</a><span className="ml-2 text-xs text-jira-text-muted">{feature.summary}</span></td>
              <td className="p-3" title={detail?.startFromStories ? "Earliest child story start date; feature start date is not set" : "Feature start date"}>{detail?.startDate?.slice(0, 10) || "Not set"}</td><td className="p-3">{feature.dueDate || "N/A"}</td>
              <td className="p-3">{stories.reduce((sum, item) => sum + (item.storyPoints || 0), 0)}</td><td className="p-3">{hours}</td><td className="p-3">{completed}/{stories.length}</td>
              <td className={`p-3 font-semibold ${status === "Past Due Date" ? "text-red-600" : status === "Delivered" ? "text-green-700" : "text-slate-600"}`}>{status}</td>
              <td className="p-3">{!detail?.eligible ? "Excluded — missing stories or dates" : detail.predictable ? "On time / within due date" : "Missed timeline"}</td>
            </tr>;
          })}</tbody>
        </table>
        {!features.length && <p className="p-4 text-sm text-jira-text-muted">No features in the selected scope.</p>}
      </div>
    </DetailModal>
  );
}

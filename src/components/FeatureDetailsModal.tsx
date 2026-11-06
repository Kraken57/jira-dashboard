"use client";

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
  const belongsTo = (item: JiraWorkItem, key: string) => {
    let parent = item.parentKey;
    const seen = new Set<string>([item.key]);
    while (parent && !seen.has(parent)) {
      if (parent === key) return true;
      seen.add(parent);
      parent = byKey.get(parent)?.parentKey;
    }
    return false;
  };
  return (
    <DetailModal title="Feature Predictability" subtitle="Delivery status based on child stories. The card percentage currently uses the existing forecast formula." onClose={onClose} wide>
      <div className="overflow-x-auto p-4">
        <table className="w-full text-left text-sm">
          <thead><tr>{["Feature", "Start date", "Due date", "Story points", "Hours logged", "Completed / total stories", "Delivery status"].map((label) => <th key={label} className="p-3 border-b font-semibold">{label}</th>)}</tr></thead>
          <tbody>{features.map((feature) => {
            const source = byKey.get(feature.key);
            const stories = items.filter((item) => /^story$/i.test(item.workType) && belongsTo(item, feature.key));
            const completed = stories.filter((item) => doneStatuses.includes(item.status)).length;
            const storyKeys = new Set(stories.map((item) => item.key));
            const loggedItems = items.filter((item) => storyKeys.has(item.key) || (/^sub-?task$/i.test(item.workType) && [...storyKeys].some((key) => belongsTo(item, key))));
            const hours = loggedItems.length && loggedItems.every((item) => item.timeSpentSeconds !== undefined)
              ? Math.round(loggedItems.reduce((sum, item) => sum + (item.timeSpentSeconds || 0), 0) / 360) / 10 : "N/A";
            const overdue = Boolean(feature.dueDate && Date.now() > Date.parse(`${feature.dueDate.slice(0, 10)}T23:59:59.999`));
            const status = !stories.length ? "No stories" : completed === stories.length ? "Delivered" : overdue ? "Past Due Date" : "In Progress";
            return <tr key={feature.key} className="border-b">
              <td className="p-3"><a className="text-jira-blue" href={jiraDomain ? `${jiraDomain}/browse/${feature.key}` : undefined} target="_blank" rel="noreferrer">{feature.key}</a><div className="text-xs text-jira-text-muted">{feature.summary}</div></td>
              <td className="p-3">{source?.startDate?.slice(0, 10) || "N/A"}</td><td className="p-3">{feature.dueDate || "N/A"}</td>
              <td className="p-3">{stories.reduce((sum, item) => sum + (item.storyPoints || 0), 0)}</td><td className="p-3">{hours}</td><td className="p-3">{completed}/{stories.length}</td>
              <td className={`p-3 font-semibold ${status === "Past Due Date" ? "text-red-600" : status === "Delivered" ? "text-green-700" : "text-slate-600"}`}>{status}</td>
            </tr>;
          })}</tbody>
        </table>
        {!features.length && <p className="p-4 text-sm text-jira-text-muted">No features in the selected scope.</p>}
      </div>
    </DetailModal>
  );
}

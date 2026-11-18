"use client";

import { useMemo, useState } from "react";
import { DetailModal } from "./DetailModal";
import { JiraWorkLink } from "./JiraWorkLink";
import type { JiraWorkItem } from "@/lib/jira/types";

type ColumnId = "key" | "summary" | "status" | "pod" | "pi" | "sprint" | "dueDate" | "ahaUrl" | "parent" | "assignee" | "storyPoints" | "subtasks" | "estimate" | "priority";
type Column = { id: ColumnId; label: string };

const COMMON: Column[] = [
  { id: "key", label: "Key" },
  { id: "summary", label: "Summary" },
];

const columnsFor = (title: string): Column[] => {
  const cardColumns: Record<string, Column[]> = {
    "Features without Aha link": [
      { id: "ahaUrl", label: "Aha! URL" }, { id: "status", label: "Status" }, { id: "pod", label: "Pod" }, { id: "pi", label: "PI" },
    ],
    "Stories without Feature links": [
      { id: "parent", label: "Current parent" }, { id: "status", label: "Status" }, { id: "assignee", label: "Assignee" }, { id: "pod", label: "Pod" },
    ],
    "Features without due date": [
      { id: "dueDate", label: "Due date" }, { id: "status", label: "Status" }, { id: "assignee", label: "Owner" }, { id: "pod", label: "Pod" }, { id: "pi", label: "PI" },
    ],
    "Features without PI tagging": [
      { id: "pi", label: "PI" }, { id: "status", label: "Status" }, { id: "pod", label: "Pod" }, { id: "sprint", label: "Sprint" },
    ],
    "Defects without parent links": [
      { id: "parent", label: "Parent" }, { id: "status", label: "Status" }, { id: "priority", label: "Priority" }, { id: "assignee", label: "Assignee" }, { id: "pod", label: "Pod" },
    ],
    "Stories without subtasks": [
      { id: "status", label: "Status" }, { id: "subtasks", label: "Subtasks" }, { id: "storyPoints", label: "Story points" }, { id: "assignee", label: "Assignee" }, { id: "pod", label: "Pod" },
    ],
    "Subtasks without original estimate": [
      { id: "parent", label: "Parent story" }, { id: "estimate", label: "Original estimate" }, { id: "status", label: "Status" }, { id: "assignee", label: "Assignee" }, { id: "pod", label: "Pod" },
    ],
    "Stories Without Estimates": [
      { id: "storyPoints", label: "Story points" }, { id: "status", label: "Status" }, { id: "assignee", label: "Assignee" }, { id: "pod", label: "Pod" },
    ],
  };
  return [...COMMON, ...(cardColumns[title] || [{ id: "status", label: "Status" }, { id: "pod", label: "Pod" }])];
};

const cellValue = (issue: JiraWorkItem, column: ColumnId) => {
  switch (column) {
    case "key": return issue.key;
    case "summary": return issue.summary;
    case "status": return issue.status;
    case "pod": return issue.podName || issue.projectName || issue.projectKey || "Unknown";
    case "pi": return issue.quarter === "All" ? "Not tagged" : issue.quarter;
    case "sprint": return issue.sprints.join(", ") || "Backlog";
    case "dueDate": return issue.dueDate?.trim() || "Not set";
    case "ahaUrl": return issue.ahaUrl === undefined ? "Not returned" : issue.ahaUrl.trim() || "Missing";
    case "parent": return issue.parentKey?.trim() || "No parent";
    case "assignee": return issue.assignee?.trim() || "Unassigned";
    case "storyPoints": return `${issue.storyPoints || 0} SP`;
    case "subtasks": return "None";
    case "estimate": return Number(issue.originalEstimateSeconds) > 0
      ? `${(Number(issue.originalEstimateSeconds) / 3600).toLocaleString(undefined, { maximumFractionDigits: 1 })} hrs`
      : "Not set";
    case "priority": return issue.priority || "None";
  }
};

export function AuditIssuesModal({ title, explanation, issues, jiraDomain, onClose }: {
  title: string;
  explanation: string;
  issues: JiraWorkItem[];
  jiraDomain?: string;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const columns = columnsFor(title);
  const filteredIssues = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return issues;
    return issues.filter((issue) => [issue.key, issue.summary, issue.status, issue.assignee || "", issue.parentKey || ""]
      .some((value) => value.toLowerCase().includes(query)));
  }, [issues, search]);

  return <DetailModal
    title={title}
    subtitle={`${issues.length} matching issues in the current scope`}
    onClose={onClose}
    wide
    bodyClassName="min-h-0 flex-1 overflow-hidden flex flex-col"
  >
    <div className="shrink-0 border-b border-jira-border bg-jira-bg/40 px-5 py-3">
      <p className="text-xs leading-relaxed text-jira-text">{explanation}</p>
      <label className="mt-3 block max-w-sm">
        <span className="sr-only">Search these audit results</span>
        <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Search key, summary, status, or person" className="w-full rounded-md border border-jira-border bg-white px-3 py-2 text-xs text-jira-text outline-none focus:border-jira-blue focus:ring-2 focus:ring-blue-100" />
      </label>
    </div>
    {filteredIssues.length === 0 ? (
      <p className="p-8 text-center text-sm text-slate-500">{issues.length ? "No issues match this search." : "No matching issues found in the current scope."}</p>
    ) : (
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[800px] table-fixed text-left text-xs">
          <thead className="sticky top-0 z-10 border-b border-jira-border bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 shadow-sm">
            <tr>{columns.map((column) => <th key={column.id} className={`whitespace-nowrap px-3 py-2.5 font-semibold ${column.id === "storyPoints" || column.id === "estimate" ? "w-28 text-right" : column.id === "key" ? "w-28" : column.id === "status" ? "w-32" : ""}`}>{column.label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredIssues.map((issue) => <tr key={issue.key} className="align-top hover:bg-slate-50/80">
              {columns.map((column) => <td key={column.id} className={`px-3 py-2.5 text-slate-700 ${column.id === "storyPoints" || column.id === "estimate" ? "whitespace-nowrap text-right tabular-nums" : ""}`}>
                {column.id === "key" ? <JiraWorkLink issueKey={issue.key} jiraDomain={jiraDomain}>{issue.key}</JiraWorkLink>
                  : column.id === "parent" && issue.parentKey?.trim() ? <span><JiraWorkLink issueKey={issue.parentKey} jiraDomain={jiraDomain}>{issue.parentKey}</JiraWorkLink>{issue.parentWorkType ? <span className="ml-1 text-slate-500">({issue.parentWorkType})</span> : null}</span>
                    : column.id === "summary" ? <span className="block truncate font-medium text-slate-900" title={issue.summary}>{issue.summary || "No summary"}</span>
                      : column.id === "status" ? <span className="inline-flex max-w-full truncate rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700" title={issue.status}>{issue.status || "Unknown"}</span>
                        : <span className="block truncate" title={String(cellValue(issue, column.id))}>{cellValue(issue, column.id)}</span>}
              </td>)}
            </tr>)}
          </tbody>
        </table>
      </div>
    )}
    <div className="shrink-0 border-t border-jira-border px-5 py-2 text-[11px] text-jira-text-muted">
      Showing {filteredIssues.length} of {issues.length} issues · Select a key to open it in Jira
    </div>
  </DetailModal>;
}

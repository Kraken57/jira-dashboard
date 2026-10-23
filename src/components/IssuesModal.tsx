"use client";

import { DetailModal } from "./DetailModal";
import { IssueRow } from "@/lib/jira/types";

interface IssuesModalProps {
  title: string;
  subtitle?: string;
  issues: IssueRow[];
  jiraDomain?: string;
  onClose: () => void;
  emptyText?: string;
}

export function IssuesModal({
  title,
  subtitle,
  issues,
  jiraDomain,
  onClose,
  emptyText,
}: IssuesModalProps) {
  const totalSP = issues.reduce((a, i) => a + (i.storyPoints || 0), 0);

  return (
    <DetailModal
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      wide
    >
      <div className="px-5 py-3 border-b border-jira-border flex flex-wrap gap-3 text-xs text-jira-text-muted">
        <span>
          <strong className="text-jira-text">{issues.length}</strong> work items
        </span>
        <span>
          <strong className="text-jira-text">{totalSP}</strong> SP
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-jira-bg text-jira-text-muted text-xs uppercase border-b border-jira-border font-semibold sticky top-0">
            <tr>
              <th className="px-4 py-2.5">Key</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5">Summary</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5 text-center">SP</th>
              <th className="px-4 py-2.5">Assignee</th>
              <th className="px-4 py-2.5">Sprint</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-jira-border/60">
            {issues.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-jira-text-muted">
                  {emptyText || "No work items for this selection."}
                </td>
              </tr>
            ) : (
              issues.map((issue) => (
                <tr key={issue.key} className="hover:bg-jira-bg/30">
                  <td className="px-4 py-2.5 font-semibold text-xs whitespace-nowrap">
                    {jiraDomain ? (
                      <a
                        href={`${jiraDomain}/browse/${issue.key}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-jira-blue hover:underline"
                      >
                        {issue.key}
                      </a>
                    ) : (
                      issue.key
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs whitespace-nowrap">{issue.workType}</td>
                  <td className="px-4 py-2.5 text-xs text-jira-text">
                    <p className="line-clamp-1">{issue.summary}</p>
                    <p className="text-[11px] text-jira-text-light mt-0.5">{issue.podName}</p>
                  </td>
                  <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        issue.isDone
                          ? "bg-jira-green-bg text-jira-green"
                          : "bg-jira-blue-bg text-jira-blue"
                      }`}
                    >
                      {issue.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center text-xs font-bold">{issue.storyPoints}</td>
                  <td className="px-4 py-2.5 text-xs whitespace-nowrap">{issue.assignee}</td>
                  <td className="px-4 py-2.5 text-xs whitespace-nowrap text-jira-text-muted">
                    {issue.sprint}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </DetailModal>
  );
}

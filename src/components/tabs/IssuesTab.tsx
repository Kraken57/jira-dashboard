"use client";

import { useMemo, useState } from "react";
import { IssueRow } from "@/lib/jira/types";

interface IssuesTabProps {
  issues: IssueRow[];
  jiraDomain?: string;
}

const PAGE_SIZE = 25;

export function IssuesTab({ issues, jiraDomain }: IssuesTabProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [page, setPage] = useState(1);

  // Available unique types and statuses
  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    issues.forEach((it) => {
      if (it.workType) set.add(it.workType);
    });
    return Array.from(set).sort();
  }, [issues]);

  const availableStatuses = useMemo(() => {
    const set = new Set<string>();
    issues.forEach((it) => {
      if (it.status) set.add(it.status);
    });
    return Array.from(set).sort();
  }, [issues]);

  // Filtered issues
  const filtered = useMemo(() => {
    return issues.filter((it) => {
      if (selectedType !== "all" && it.workType !== selectedType) return false;
      if (selectedStatus !== "all" && it.status !== selectedStatus) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesKey = it.key.toLowerCase().includes(q);
        const matchesSummary = it.summary.toLowerCase().includes(q);
        const matchesAssignee = it.assignee.toLowerCase().includes(q);
        if (!matchesKey && !matchesSummary && !matchesAssignee) return false;
      }
      return true;
    });
  }, [issues, selectedType, selectedStatus, searchTerm]);

  // Reset page when filters change
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedIssues = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Search and Filters Bar */}
      <div className="bg-white border border-jira-border rounded-lg p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex-1 w-full md:w-auto relative">
          <input
            type="text"
            placeholder="Search by key (e.g. CRM-101), summary, or assignee..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            className="w-full text-sm border border-jira-border rounded-md px-3.5 py-2 pl-9 focus:outline-none focus:border-jira-blue transition-colors"
          />
          <svg
            className="w-4 h-4 text-jira-text-muted absolute left-3 top-3 pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto shrink-0">
          <select
            value={selectedType}
            onChange={(e) => {
              setSelectedType(e.target.value);
              setPage(1);
            }}
            className="text-xs border border-jira-border rounded-md px-3 py-2 bg-white text-jira-text focus:outline-none focus:border-jira-blue"
          >
            <option value="all">All Types</option>
            {availableTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setPage(1);
            }}
            className="text-xs border border-jira-border rounded-md px-3 py-2 bg-white text-jira-text focus:outline-none focus:border-jira-blue"
          >
            <option value="all">All Statuses</option>
            {availableStatuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <span className="text-xs font-semibold text-jira-text-muted shrink-0">
            {filtered.length} issues
          </span>
        </div>
      </div>

      {/* Issues Table */}
      <div className="bg-white border border-jira-border rounded-lg overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-jira-bg text-jira-text-muted text-xs uppercase border-b border-jira-border font-semibold">
              <tr>
                <th className="px-5 py-3 w-28">Key</th>
                <th className="px-5 py-3 w-24">Type</th>
                <th className="px-5 py-3">Summary</th>
                <th className="px-5 py-3 w-24 text-center">SP</th>
                <th className="px-5 py-3 w-32">Priority</th>
                <th className="px-5 py-3 w-36">Assignee</th>
                <th className="px-5 py-3 w-32 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-jira-border/60">
              {pagedIssues.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-jira-text-muted">
                    No work items match your current filter criteria.
                  </td>
                </tr>
              ) : (
                pagedIssues.map((issue) => {
                  const isDone = issue.isDone;
                  const isInProgress = /progress|development|review/i.test(issue.status);

                  return (
                    <tr key={issue.key} className="hover:bg-jira-bg/30 transition-colors">
                      <td className="px-5 py-3 font-semibold text-xs whitespace-nowrap">
                        <a
                          href={
                            jiraDomain
                              ? `${jiraDomain}/browse/${issue.key}`
                              : undefined
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-jira-blue hover:underline inline-flex items-center gap-1"
                        >
                          {issue.key}
                          <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                            issue.workType === "Bug"
                              ? "bg-jira-red-bg text-jira-red"
                              : issue.workType === "Story"
                              ? "bg-jira-blue-bg text-jira-blue"
                              : "bg-jira-bg text-jira-text-muted border border-jira-border/60"
                          }`}
                        >
                          {issue.workType}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-jira-text font-medium text-xs line-clamp-1">
                          {issue.summary}
                        </p>
                        <p className="text-[11px] text-jira-text-light mt-0.5">
                          {issue.podName} • {issue.sprint}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-center whitespace-nowrap">
                        <span className="text-xs font-bold bg-jira-bg px-2 py-0.5 rounded border border-jira-border/60 text-jira-text">
                          {issue.storyPoints}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs whitespace-nowrap">
                        <span
                          className={`font-semibold ${
                            issue.priority === "Highest" || issue.priority === "High"
                              ? "text-jira-red"
                              : issue.priority === "Medium"
                              ? "text-jira-amber"
                              : "text-jira-text-muted"
                          }`}
                        >
                          {issue.priority}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-jira-text whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-jira-blue-bg text-jira-blue flex items-center justify-center text-[10px] font-bold shrink-0">
                            {issue.assignee.slice(0, 1)}
                          </span>
                          <span className="truncate max-w-[100px]">{issue.assignee}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            isDone
                              ? "bg-jira-green-bg text-jira-green"
                              : isInProgress
                              ? "bg-jira-blue-bg text-jira-blue"
                              : "bg-jira-bg text-jira-text-muted"
                          }`}
                        >
                          {issue.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        {totalPages > 1 && (
          <div className="px-6 py-3 border-t border-jira-border flex items-center justify-between text-xs text-jira-text-muted">
            <span>
              Showing {(currentPage - 1) * PAGE_SIZE + 1} to{" "}
              {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} issues
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1 rounded border border-jira-border font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-jira-bg transition-colors"
              >
                Previous
              </button>
              <span className="font-semibold text-jira-text">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1 rounded border border-jira-border font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-jira-bg transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


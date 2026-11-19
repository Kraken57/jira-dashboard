"use client";

import { useMemo, useState } from "react";
import { getAuditCards } from "@/lib/auditChecks";
import { AuditIssuesModal } from "@/components/AuditIssuesModal";
import { DashboardFilters, IssueRow, JiraWorkItem, SprintMeta } from "@/lib/jira/types";

interface IssuesTabProps {
  issues: IssueRow[];
  auditItems: JiraWorkItem[];
  filters: DashboardFilters;
  sprintMeta?: Record<string, SprintMeta>;
  jiraDomain?: string;
}

/* Kept for the commented-out general Issues table below.
const PAGE_SIZE = 25;
const workTypeOrder = (type: string) => /^feature$|^epic$/i.test(type) ? 0 : /^story$/i.test(type) ? 1 : /^sub-?task$/i.test(type) ? 2 : 3;
*/


export function IssuesTab({ auditItems, filters, sprintMeta = {}, jiraDomain }: IssuesTabProps) {
  /* State retained with the commented-out general Issues table.
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [page, setPage] = useState(1);
  */
  const [auditModal, setAuditModal] = useState<{ title: string; explanation: string; issues: JiraWorkItem[] } | null>(null);

  const { scopedAuditItems, auditCards } = useMemo(
    () => getAuditCards(auditItems, filters, sprintMeta),
    [auditItems, filters, sprintMeta]
  );

  /* General Issues table filters retained for later reuse.
  // Available unique types and statuses
  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    issues.forEach((it) => {
      if (it.workType) set.add(it.workType);
    });
    return Array.from(set).sort((a, b) => workTypeOrder(a) - workTypeOrder(b) || a.localeCompare(b));
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
    }).sort((a, b) => workTypeOrder(a.workType) - workTypeOrder(b.workType) || a.key.localeCompare(b.key, undefined, { numeric: true }));
  }, [issues, selectedType, selectedStatus, searchTerm]);

  // Reset page when filters change
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedIssues = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  */

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
          <h2 className="text-lg font-bold text-slate-900">Audit issue checks</h2>
          <p className="mt-1 text-xs text-slate-500">Find missing parent links and planning fields in the current Pod, PI, and Sprint scope. Select a card to inspect matching Jira issues. Counts cover the work loaded by the dashboard’s Jira query.</p>
        </div>
        {scopedAuditItems.some((item) => /^feature$/i.test(item.workType) && item.ahaUrl === undefined) && (
          <p className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-900">Aha URL data is unavailable for some features. Refresh the dashboard, or ask your administrator to check the Aha field mapping. Unknown values are not counted as empty.</p>
        )}
        <div className="space-y-6 bg-slate-50/70 p-4 sm:p-5">
          {[
            { title: "Feature related issues", cards: auditCards.filter((card) => card.title.startsWith("Features without")) },
            { title: "Story related issues", cards: auditCards.filter((card) => card.title.startsWith("Stories without")) },
            { title: "Subtask related issues", cards: auditCards.filter((card) => card.title.startsWith("Subtasks without")) },
            { title: "Defect related issues", cards: auditCards.filter((card) => card.title.startsWith("Defects without")) },
          ].map((group) => (
            <section key={group.title}>
              <h3 className="mb-3 text-sm font-semibold text-slate-700">{group.title}</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {group.cards.map((card) => {
            const colors: Record<string, string> = {
              amber: "border-amber-200 text-amber-800 hover:border-amber-300",
              rose: "border-rose-200 text-rose-800 hover:border-rose-300",
              violet: "border-violet-200 text-violet-800 hover:border-violet-300",
              orange: "border-orange-200 text-orange-800 hover:border-orange-300",
              blue: "border-blue-200 text-blue-800 hover:border-blue-300",
              teal: "border-teal-200 text-teal-800 hover:border-teal-300",
            };
            return (
              <button
                key={card.title}
                type="button"
                onClick={() => setAuditModal({ title: card.title, explanation: card.explanation, issues: card.issues })}
                className={`rounded-xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${colors[card.tone]}`}
              >
                <p className="text-[10px] font-bold uppercase tracking-wide">{card.title}</p>
                <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{card.title === "Features without Aha link" && scopedAuditItems.some((item) => /^feature$/i.test(item.workType) && item.ahaUrl === undefined) ? (scopedAuditItems.every((item) => !/^feature$/i.test(item.workType) || item.ahaUrl === undefined) ? "Unavailable" : `${card.issues.length}+`) : card.issues.length}</p>
                <p className="mt-1 text-[11px] text-slate-500">{card.note}</p>
              </button>
            );
          })}
              </div>
            </section>
          ))}
        </div>
      </section>

      {/*
      Search and Filters Bar
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

      Issues Table
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
                        <JiraWorkLink issueKey={issue.key} jiraDomain={jiraDomain}>
                          {issue.key}
                          <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </JiraWorkLink>
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
                        <p className="text-jira-text font-medium text-xs line-clamp-1" title={issue.summary}>
                          {issue.summary}
                        </p>
                        <p className="text-[11px] text-jira-text-light mt-0.5" title={`${issue.podName} • ${issue.sprint}`}>
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

        Pagination footer
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
      */}

      {auditModal && <AuditIssuesModal
        title={auditModal.title}
        explanation={auditModal.explanation}
        issues={auditModal.issues}
        jiraDomain={jiraDomain}
        onClose={() => setAuditModal(null)}
      />}
    </div>
  );
}


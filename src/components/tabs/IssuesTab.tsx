"use client";

import { useMemo, useState } from "react";
import { DetailModal } from "@/components/DetailModal";
import { DashboardFilters, IssueRow, JiraWorkItem, SprintMeta } from "@/lib/jira/types";

interface IssuesTabProps {
  issues: IssueRow[];
  auditItems: JiraWorkItem[];
  filters: DashboardFilters;
  sprintMeta?: Record<string, SprintMeta>;
  jiraDomain?: string;
}

const PAGE_SIZE = 25;
const workTypeOrder = (type: string) => /^feature$|^epic$/i.test(type) ? 0 : /^story$/i.test(type) ? 1 : /^sub-?task$/i.test(type) ? 2 : 3;

export function IssuesTab({ issues, auditItems, filters, sprintMeta = {}, jiraDomain }: IssuesTabProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [auditModal, setAuditModal] = useState<{ title: string; explanation: string; issues: JiraWorkItem[] } | null>(null);

  const scopedAuditItems = useMemo(() => {
    const eligibleItems = [...new Map(auditItems.filter((item) => !/^cancel{1,2}ed$/i.test(item.status.trim())).map((item) => [item.key, item])).values()];
    const allByKey = new Map(eligibleItems.map((item) => [item.key, item]));
    const podValues = Array.isArray(filters.podId) ? filters.podId : [filters.podId];
    const quarterValues = Array.isArray(filters.quarterId) ? filters.quarterId : [filters.quarterId];
    const selectedSprints = Array.isArray(filters.sprintId) ? filters.sprintId : [filters.sprintId];
    const allPods = podValues.includes("all");
    const allQuarters = quarterValues.includes("all");
    const allSprints = selectedSprints.includes("all");
    const selectedPods = podValues.filter((id) => id !== "all");
    const selectedQuarters = quarterValues.filter((id) => id !== "all");
    const sprintMatches = (sprints: string[]) => allSprints || (selectedSprints.length > 0 && sprints.some((name) => {
      if (selectedSprints.includes(name)) return true;
      const meta = sprintMeta[name];
      if (!meta?.startDate || !meta.endDate) return false;
      const start = Date.parse(meta.startDate);
      const end = Date.parse(meta.endDate);
      if (Number.isNaN(start) || Number.isNaN(end)) return false;
      const range = `${new Date(start).toISOString().slice(0, 10)}/${new Date(end).toISOString().slice(0, 10)}`;
      return selectedSprints.some((selected) => selected.split("::")[1] === range);
    }));
    const contextualItems = eligibleItems.map((item) => {
      if (!/^sub-?task$/i.test(item.workType) || !item.parentKey) return item;
      const parent = allByKey.get(item.parentKey);
      if (!parent) return item;
      return {
        ...item,
        quarter: item.quarter && item.quarter !== "All" ? item.quarter : parent.quarter,
        sprints: item.sprints.length ? item.sprints : parent.sprints,
      };
    });
    const directlyScoped = contextualItems.filter((item) =>
      (allPods || selectedPods.includes(item.podKey)) &&
      (allQuarters || selectedQuarters.includes(item.quarter)) &&
      sprintMatches(item.sprints)
    );
    // Features often have no sprint/PI themselves. Include those reached
    // through child work in scope, while respecting the selected pod(s).
    const includedKeys = new Set(directlyScoped.map((item) => item.key));
    for (const item of directlyScoped) {
      let parentKey = item.parentKey;
      const seen = new Set<string>([item.key]);
      while (parentKey && !seen.has(parentKey)) {
        seen.add(parentKey);
        const parent = allByKey.get(parentKey);
        if (!parent) break;
        if (/^feature$|^epic$/i.test(parent.workType) && (allPods || selectedPods.includes(parent.podKey))) includedKeys.add(parent.key);
        parentKey = parent.parentKey;
      }
    }
    return contextualItems.filter((item) => includedKeys.has(item.key));
  }, [auditItems, filters, sprintMeta]);

  const auditCards = useMemo(() => {
    const projectsWithFeatures = new Set(auditItems.filter((item) => /^feature$/i.test(item.workType)).map((item) => item.projectKey));
    const isFeature = (item: JiraWorkItem) => /^feature$/i.test(item.workType) ||
      (/^epic$/i.test(item.workType) && !projectsWithFeatures.has(item.projectKey));
    const storyType = /^story$/i;
    const bugType = /^(bug|defect)$/i;
    const subtaskType = /^sub-?task$/i;
    const byKey = new Map(auditItems.map((item) => [item.key, item]));
    const resolvedParentType = (item: JiraWorkItem) => {
      const parent = item.parentKey ? byKey.get(item.parentKey) : undefined;
      return { type: item.parentWorkType || parent?.workType || "", projectKey: parent?.projectKey || item.projectKey };
    };
    const isOrphanedFrom = (item: JiraWorkItem, isExpectedParent: (type: string, projectKey?: string) => boolean) => {
      if (!item.parentKey) return true;
      const parent = resolvedParentType(item);
      // If Jira supplied a parent key but its type is unavailable in the
      // fetched data, don't report it as an orphan based on missing access.
      return Boolean(parent.type && !isExpectedParent(parent.type, parent.projectKey));
    };
    const isFeatureParent = (type: string, projectKey?: string) => /^feature$/i.test(type) ||
      (/^epic$/i.test(type) && !projectsWithFeatures.has(projectKey));
    const isStoryParent = (type: string) => /^story$/i.test(type);
    const isInEstimateExcludedStatus = (status: string) => {
      const normalized = status.trim().toLowerCase().replace(/[\s_-]+/g, " ");
      return normalized === "pending approval";
    };
    return [
      {
        title: "Features without planning link",
        note: "Features missing their planning-system reference",
        explanation: "Jira Feature issues whose Aha! URL is empty/null in the selected pod, PI and sprint scope. This checks the Aha URL field, not whether a feature has child stories. Features whose field was not returned are excluded because its value is unknown.",
        issues: scopedAuditItems.filter((item) => /^feature$/i.test(item.workType) && item.ahaUrl === ""),
        tone: "violet",
      },
      {
        title: "Orphan Stories",
        note: "Stories without a linked Feature parent",
        explanation: "A story is counted when it has no parent, or its known parent is not a Feature (Epic is used for projects with no Feature issue type).",
        issues: scopedAuditItems.filter((item) => storyType.test(item.workType) && isOrphanedFrom(item, isFeatureParent)),
        tone: "amber",
      },
      {
        title: "Features without due date",
        note: "Features or Epics missing Jira due dates",
        explanation: "Feature due dates are read from Jira's due date field. Epic is used for projects with no Feature issue type.",
        issues: scopedAuditItems.filter((item) => isFeature(item) && !item.dueDate?.trim()),
        tone: "rose",
      },
      {
        title: "Features without PI tagging",
        note: "Features without a recognized Program Increment",
        explanation: "PI tagging is derived from the feature's sprint name using the dashboard's quarter/PI mapping. Features with no recognized PI are included.",
        issues: scopedAuditItems.filter((item) => isFeature(item) && item.quarter === "All"),
        tone: "violet",
      },
      {
        title: "Orphan Defects",
        note: "Bugs without any linked parent issue",
        explanation: "A defect is orphaned only when it has no parent issue. A link to a Story, Feature, Epic, or any other parent means it is not orphaned.",
        issues: scopedAuditItems.filter((item) => bugType.test(item.workType) && !item.parentKey?.trim()),
        tone: "orange",
      },
      {
        title: "Orphan Subtasks",
        note: "Sub-tasks missing a linked Story parent",
        explanation: "A sub-task is counted when it has no parent, or the fetched parent issue is not a Story.",
        issues: scopedAuditItems.filter((item) => subtaskType.test(item.workType) && isOrphanedFrom(item, isStoryParent)),
        tone: "blue",
      },
      {
        title: "Stories Without Estimates",
        note: "Stories with 0 story points, excluding Pending Approval",
        explanation: "A story is included when it has no story points (0) and its status is not Pending Approval.",
        issues: scopedAuditItems.filter((item) =>
          storyType.test(item.workType) &&
          !(item.storyPoints > 0) &&
          !isInEstimateExcludedStatus(item.status)
        ),
        tone: "teal",
      },
    ].sort((a, b) => {
      const rank = (title: string) => title.startsWith("Feature") ? 0 : /Stor/.test(title) ? 1 : /Subtask/.test(title) ? 2 : 3;
      return rank(a.title) - rank(b.title);
    });
  }, [auditItems, scopedAuditItems]);

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
        <div className="grid grid-cols-1 gap-3 bg-slate-50/70 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-12">
          {auditCards.map((card, index) => {
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
                className={`rounded-xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${index < 4 ? "lg:col-span-3" : "lg:col-span-4"} ${index === auditCards.length - 1 ? "sm:col-span-2 lg:col-span-4" : ""} ${colors[card.tone]}`}
              >
                <p className="text-[10px] font-bold uppercase tracking-wide">{card.title}</p>
                <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{card.title === "Features without planning link" && scopedAuditItems.some((item) => /^feature$/i.test(item.workType) && item.ahaUrl === undefined) ? (scopedAuditItems.every((item) => !/^feature$/i.test(item.workType) || item.ahaUrl === undefined) ? "Unavailable" : `${card.issues.length}+`) : card.issues.length}</p>
                <p className="mt-1 text-[11px] text-slate-500">{card.note}</p>
              </button>
            );
          })}
        </div>
      </section>

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

      {auditModal && (
        <DetailModal title={auditModal.title} subtitle={`${auditModal.issues.length} matching issues in the current scope`} onClose={() => setAuditModal(null)} wide>
          <div className="border-b border-jira-border bg-jira-bg/40 px-5 py-4 text-sm text-jira-text">{auditModal.explanation}</div>
          {auditModal.issues.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500">No matching issues found in the current scope.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {auditModal.issues.map((issue) => (
                <article key={issue.key} className="p-4 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <a href={jiraDomain ? `${jiraDomain}/browse/${issue.key}` : undefined} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-jira-blue hover:underline">{issue.key}</a>
                      <h3 className="mt-1 text-sm font-semibold text-slate-900">{issue.summary}</h3>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-700">{issue.status}</span>
                  </div>
                  <div className="mt-3 grid gap-x-5 gap-y-1.5 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
                    <p><b>Type:</b> {issue.workType}</p>
                    <p><b>Story points:</b> {issue.storyPoints}</p>
                    <p><b>Parent:</b> {issue.parentKey || "None"}{issue.parentWorkType ? ` · ${issue.parentWorkType}` : ""}</p>
                    <p><b>Pod:</b> {issue.podName || issue.projectName || issue.projectKey || "Unknown"}</p>
                    <p><b>PI:</b> {issue.quarter === "All" ? "Not tagged" : issue.quarter}</p>
                    <p><b>Sprint:</b> {issue.sprints.join(", ") || "Backlog"}</p>
                    <p><b>Due date:</b> {issue.dueDate || "None"}</p>
                    <p><b>Aha URL:</b> {issue.ahaUrl === undefined ? "Not returned" : issue.ahaUrl || "Empty"}</p>
                    <p><b>Assignee:</b> {issue.assignee || "Unassigned"}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </DetailModal>
      )}
    </div>
  );
}


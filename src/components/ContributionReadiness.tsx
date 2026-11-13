"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { fetchContributionWorklogPage } from "@/lib/api";
import { loadContributionWorklogs } from "@/lib/jira/contributionWorklogLoader";
import type { ContributionStorySource, ContributionWorklog, JiraWorkItem } from "@/lib/jira/types";

type WorklogCheck = { status: "loaded"; rows: ContributionWorklog[] } | { status: "error"; message: string };
const hours = (seconds = 0) => (seconds / 3600).toLocaleString(undefined, { maximumFractionDigits: 2 });
const canceled = (item: JiraWorkItem) => /^cancel{1,2}ed$/i.test(item.status.trim());

function WorkItemLink({ item, jiraDomain }: { item: JiraWorkItem; jiraDomain?: string }) {
  if (!jiraDomain) return <span>{item.key}</span>;
  const href = `${jiraDomain.replace(/\/+$/, "")}/browse/${encodeURIComponent(item.key)}`;
  return <a className="font-semibold text-jira-blue hover:underline" href={href} target="_blank" rel="noopener noreferrer" onClick={(event) => {
    if (window.self === window.top || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void import("@forge/bridge").then(({ router }) => router.open(href));
  }}>{item.key}</a>;
}

export function ContributionReadiness({ sources, jiraDomain, scopeLabel }: {
  sources: ContributionStorySource[];
  jiraDomain?: string;
  scopeLabel: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, WorklogCheck>>({});
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const run = useRef(0);
  useEffect(() => () => { run.current++; }, []);

  // Include all child work, even when its own sprint is empty or differs from the parent.
  const checkable = sources.filter((source) => source.subtasks.length > 0);
  const items = [...new Map(checkable.flatMap((source) => [source.story, ...source.subtasks]).map((item) => [item.key, item])).values()];
  const checked = items.filter((item) => checks[item.key]?.status === "loaded").length;
  const failures = items.filter((item) => checks[item.key]?.status === "error").length;
  const missingChildren = sources.filter((source) => source.missingSubtaskKeys.length > 0 || !source.childListKnown).length;
  const withoutChildren = sources.filter((source) => source.childListKnown && !source.subtasks.length && !source.missingSubtaskKeys.length).length;
  const visible = sources.filter((source) => `${source.story.key} ${source.story.summary}`.toLowerCase().includes(search.trim().toLowerCase()));
  const pages = Math.max(1, Math.ceil(visible.length / 10));
  const currentPage = Math.min(page, pages - 1);

  const checkWorklogs = async () => {
    const id = ++run.current;
    setLoading(true);
    const pending = checked === items.length ? items : items.filter((item) => checks[item.key]?.status !== "loaded");
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(3, pending.length) }, async () => {
      while (run.current === id) {
        const item = pending[next++];
        if (!item) break;
        try {
          const rows = await loadContributionWorklogs(item.key, fetchContributionWorklogPage, () => run.current === id);
          if (run.current === id) setChecks((prev) => ({ ...prev, [item.key]: { status: "loaded", rows } }));
        } catch (error) {
          if (run.current === id) setChecks((prev) => ({ ...prev, [item.key]: {
            status: "error", message: error instanceof Error ? error.message : "Worklogs unavailable",
          } }));
        }
      }
    }));
    if (run.current === id) setLoading(false);
  };

  return <section className="overflow-hidden rounded-lg border border-jira-border bg-white shadow-sm" aria-label="Contribution data check">
    <div className="border-b border-jira-border px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-jira-text">Individual Contribution · Data Check</h3>
          <p className="mt-1 text-xs text-jira-text-muted">Step 1: check completed stories, child estimates, and who logged the effort.</p>
        </div>
        {loading
          ? <button type="button" className="rounded border border-jira-border px-3 py-2 text-xs font-semibold" onClick={() => { run.current++; setLoading(false); }}>Stop check</button>
          : <button type="button" disabled={!items.length} className="rounded bg-jira-blue px-3 py-2 text-xs font-semibold text-white disabled:opacity-40" onClick={() => void checkWorklogs()}>{failures ? "Retry missing worklogs" : checked === items.length && items.length > 0 ? "Recheck worklogs" : "Check worklogs"}</button>}
      </div>
      <p className="mt-2 text-xs text-jira-text-muted">{scopeLabel} · Completed stories only. Credit follows the completion sprint.</p>
      <p className="mt-2 text-xs" role="status" aria-live="polite">{sources.length} completed stories · {withoutChildren} without subtasks (excluded) · {missingChildren} with incomplete child data · Worklogs checked: {checked}/{items.length}{failures ? ` · ${failures} unavailable` : ""}{loading ? " · Checking…" : ""}</p>
      <p className="mt-1 text-xs text-jira-text-muted">Original Estimates belong to the subtask assignee. Logged Effort belongs to the worklog author. Worklog dates show when the effort was spent. Point allocation and efficiency are not calculated in this step.</p>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-jira-border px-5 py-3">
      <input className="rounded border border-jira-border px-3 py-1.5 text-xs" aria-label="Search completed stories" placeholder="Search story key or summary" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} />
      <div className="flex items-center gap-3 text-xs">
        <button type="button" disabled={currentPage === 0} className="disabled:opacity-40" onClick={() => setPage(currentPage - 1)}>Previous</button>
        <span>{currentPage + 1} / {pages}</span>
        <button type="button" disabled={currentPage === pages - 1} className="disabled:opacity-40" onClick={() => setPage(currentPage + 1)}>Next</button>
      </div>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-jira-bg text-jira-text-muted"><tr>
          <th className="px-4 py-3">Story</th><th className="px-4 py-3">Completion sprint</th><th className="px-4 py-3">Subtasks</th><th className="px-4 py-3">Original Estimates<br /><span className="font-normal">Subtasks only</span></th><th className="px-4 py-3">Data checks</th>
        </tr></thead>
        <tbody className="divide-y divide-jira-border">
          {!visible.length && <tr><td colSpan={5} className="px-5 py-8 text-center text-jira-text-muted">No completed stories match this selection. Open work is not included.</td></tr>}
          {visible.slice(currentPage * 10, (currentPage + 1) * 10).map((source) => {
            const childEstimate = source.subtasks.reduce((sum, child) => sum + (child.originalEstimateSeconds || 0), 0);
            const noEstimate = source.subtasks.filter((child) => !(child.originalEstimateSeconds && child.originalEstimateSeconds > 0)).length;
            const unknownOwners = source.subtasks.filter((child) => !child.assigneeAccountId).length;
            return <Fragment key={source.story.key}>
              <tr className="align-top">
                <td className="max-w-64 px-4 py-3"><div className="flex items-center gap-2"><button type="button" aria-label={`Show data for ${source.story.key}`} aria-expanded={expanded === source.story.key} onClick={() => setExpanded(expanded === source.story.key ? null : source.story.key)}>{expanded === source.story.key ? "▾" : "▸"}</button><WorkItemLink item={source.story} jiraDomain={jiraDomain} /></div><p className="mt-1 line-clamp-2" title={source.story.summary}>{source.story.summary}</p></td>
                <td className="max-w-64 px-4 py-3"><p>{source.completionSprintLabel}</p><p className={`mt-1 ${source.completionDateConfirmed ? "text-jira-text-muted" : "text-jira-amber"}`}>{source.completionDateConfirmed ? "Matched using completion date" : "Sprint/date needs verification"}</p></td>
                <td className="px-4 py-3">{source.subtasks.length}{source.missingSubtaskKeys.length > 0 && <p className="text-jira-amber">{source.missingSubtaskKeys.length} outside feed</p>}</td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums">{hours(childEstimate)} hrs</td>
                <td className="px-4 py-3 text-jira-text-muted">{!source.childListKnown ? "Refresh dashboard to retrieve child list" : !source.subtasks.length && !source.missingSubtaskKeys.length ? "Excluded: no subtasks" : <>{noEstimate > 0 && <p>{noEstimate} without a positive estimate</p>}{unknownOwners > 0 && <p>{unknownOwners} without an assignee account ID</p>}<p>{[source.story, ...source.subtasks].filter((item) => checks[item.key]?.status === "loaded").length}/{source.subtasks.length + 1} work items checked</p></>}</td>
              </tr>
              {expanded === source.story.key && <tr><td colSpan={5} className="bg-slate-50 px-4 py-4">
                <p className="mb-3 text-xs text-jira-text-muted">{source.story.resolutionDate ? `Story completion: ${source.story.resolutionDate}` : "Story has no resolution date."} Parent-story hours are listed separately; they are not added to the subtask estimate total.</p>
                {source.missingSubtaskKeys.length > 0 && <p className="mb-3 text-jira-amber">Missing from the configured feed: {source.missingSubtaskKeys.join(", ")}. Attribution will need complete child data.</p>}
                <table className="w-full text-left text-xs"><thead><tr><th className="p-2">Work item / Estimate owner</th><th className="p-2">Original Estimate</th><th className="p-2">Logged Effort<br /><span className="font-normal">Jira snapshot</span></th><th className="p-2">Worklog author / Date / Hours</th></tr></thead>
                  <tbody>{[source.story, ...source.subtasks].filter((item) => !canceled(item)).map((item) => {
                    const check = checks[item.key];
                    const totalSeconds = check?.status === "loaded" ? check.rows.reduce((sum, row) => sum + row.timeSpentSeconds, 0) : null;
                    return <tr key={item.key} className="border-t border-jira-border align-top">
                      <td className="p-2"><WorkItemLink item={item} jiraDomain={jiraDomain} /><p>{item.key === source.story.key ? "Parent story" : "Subtask"} · {item.assignee || "Unassigned"}</p><p className="max-w-64 truncate text-jira-text-muted" title={item.summary}>{item.summary}</p></td>
                      <td className="whitespace-nowrap p-2">{hours(item.originalEstimateSeconds)} hrs</td><td className="whitespace-nowrap p-2">{hours(item.timeSpentSeconds)} hrs</td>
                      <td className="p-2">{!check ? "Not checked" : check.status === "error" ? <p className="text-jira-red">{check.message}</p> : <>
                        <p className="mb-1 font-semibold">{check.rows.length} entries · {hours(totalSeconds || 0)} hrs</p>
                        {totalSeconds !== (item.timeSpentSeconds || 0) && <p className="mb-1 text-jira-amber">Different from the Jira snapshot. Refresh and check worklog visibility before using these totals.</p>}
                        {!check.rows.length && <p>No readable worklogs</p>}
                        <ul className="max-h-44 space-y-1 overflow-y-auto">{check.rows.map((row) => <li key={row.id}>{row.authorName} · {row.started ? new Date(row.started).toLocaleString() : "Date unavailable"} · {hours(row.timeSpentSeconds)} hrs{!row.authorAccountId && <span className="text-jira-amber"> · Author ID unavailable</span>}</li>)}</ul>
                      </>}</td>
                    </tr>;
                  })}</tbody>
                </table>
              </td></tr>}
            </Fragment>;
          })}
        </tbody>
      </table>
    </div>
  </section>;
}

"use client";

import { useState } from "react";
import type { ContributorMetrics } from "@/lib/jira/contributorMetrics";

const format = (value: number, digits = 2) => value.toLocaleString(undefined, { maximumFractionDigits: digits });
const PAGE_SIZE = 20;

export function ContributorSummary({ data, scopeLabel }: { data: ContributorMetrics; scopeLabel: string }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("efficiency-desc");
  const [page, setPage] = useState(0);
  const people = data.people.filter((person) => person.name.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "points") return b.attributedStoryPoints - a.attributedStoryPoints || a.name.localeCompare(b.name);
    if (a.efficiency === null || b.efficiency === null) return a.efficiency === b.efficiency ? a.name.localeCompare(b.name) : a.efficiency === null ? 1 : -1;
    return (sort === "efficiency-asc" ? a.efficiency - b.efficiency : b.efficiency - a.efficiency) || a.name.localeCompare(b.name);
  });
  const pages = Math.max(1, Math.ceil(people.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const total = people.reduce((sum, person) => ({
    subtasks: sum.subtasks + person.subtaskCount,
    estimate: sum.estimate + person.originalEstimateHours,
    logged: sum.logged + person.loggedEffortHours,
    points: sum.points + person.attributedStoryPoints,
  }), { subtasks: 0, estimate: 0, logged: 0, points: 0 });

  return <section className="overflow-hidden rounded-lg border border-jira-border bg-white shadow-sm" aria-label="Contributor contribution and efficiency">
    <div className="border-b border-jira-border px-5 py-4">
      <h3 className="text-sm font-bold text-jira-text">Contribution & Efficiency</h3>
      <p className="mt-1 text-xs text-jira-text-muted">{scopeLabel} · {data.people.length} contributors</p>
      <p className="mt-2 text-xs text-jira-text-muted">Subtask counts and hours use the same selected work as Capacity View. Attributed points come from completed stories in their completion sprint, split by each person’s share of subtask Original Estimates.</p>
      <p className="mt-1 text-xs text-jira-text-muted">Efficiency = Attributed Story Points ÷ Logged Effort shown here. Logged Effort uses Jira’s work-item totals grouped by current assignee, as in Capacity View.</p>
      {(data.storiesWithoutSubtasks > 0 || data.storiesWithoutEstimates > 0 || data.subtasksWithoutEstimates > 0 || data.unassignedStoryPoints > 0) && <p className="mt-2 text-xs text-jira-amber">
        {data.storiesWithoutSubtasks} completed stories without subtasks and {data.storiesWithoutEstimates} without positive subtask estimates excluded from attribution.
        {data.subtasksWithoutEstimates > 0 && ` ${data.subtasksWithoutEstimates} subtasks without a positive estimate receive no points.`}
        {data.unassignedStoryPoints > 0 && ` ${format(data.unassignedStoryPoints)} SP belong to unassigned subtasks.`}
      </p>}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-jira-border px-5 py-3">
      <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Search contributors…" aria-label="Search contributors" className="min-w-48 rounded border border-jira-border px-3 py-2 text-xs" />
      <select value={sort} aria-label="Sort contributors" className="rounded border border-jira-border bg-white px-3 py-2 text-xs" onChange={(event) => { setSort(event.target.value); setPage(0); }}>
        <option value="efficiency-desc">Efficiency: highest first</option>
        <option value="efficiency-asc">Efficiency: lowest first</option>
        <option value="points">Attributed SP: highest first</option>
        <option value="name">Name: A–Z</option>
      </select>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-jira-bg text-jira-text-muted"><tr>
          <th className="px-4 py-3">Contributor</th><th className="px-4 py-3 text-right">Subtask Count</th>
          <th className="px-4 py-3 text-right">Original Estimates<span className="block font-normal">Hours</span></th>
          <th className="px-4 py-3 text-right">Logged Effort<span className="block font-normal">Hours</span></th>
          <th className="px-4 py-3 text-right">Attributed Story Points</th><th className="px-4 py-3 text-right">Efficiency<span className="block font-normal">SP/hour</span></th>
        </tr></thead>
        <tbody className="divide-y divide-jira-border">
          {!people.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-jira-text-muted">No contributors match this selection.</td></tr>}
          {people.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((person) => <tr key={person.name} className="hover:bg-jira-bg/40">
            <td className="px-4 py-3 font-semibold text-jira-text">{person.name}</td><td className="px-4 py-3 text-right tabular-nums">{person.subtaskCount}</td>
            <td className="px-4 py-3 text-right tabular-nums">{format(person.originalEstimateHours)}</td><td className="px-4 py-3 text-right tabular-nums">{format(person.loggedEffortHours)}</td>
            <td className="px-4 py-3 text-right font-semibold tabular-nums text-jira-blue">{format(person.attributedStoryPoints)}</td>
            <td className="px-4 py-3 text-right tabular-nums" title={person.efficiency === null ? "No logged effort in the selected scope" : "Attributed Story Points divided by Logged Effort"}>{person.efficiency === null ? "N/A" : format(person.efficiency, 3)}</td>
          </tr>)}
        </tbody>
        <tfoot className="border-t-2 border-jira-border bg-jira-bg/60 font-semibold"><tr>
          <td className="px-4 py-3">{search.trim() ? "Matching contributors total" : "Overall total"}</td><td className="px-4 py-3 text-right tabular-nums">{total.subtasks}</td>
          <td className="px-4 py-3 text-right tabular-nums">{format(total.estimate)}</td><td className="px-4 py-3 text-right tabular-nums">{format(total.logged)}</td>
          <td className="px-4 py-3 text-right tabular-nums">{format(total.points)}</td><td className="px-4 py-3 text-right tabular-nums">{total.logged > 0 ? format(total.points / total.logged, 3) : "N/A"}</td>
        </tr></tfoot>
      </table>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-jira-border px-5 py-3 text-xs text-jira-text-muted">
      <span>{people.length ? currentPage * PAGE_SIZE + 1 : 0}–{Math.min((currentPage + 1) * PAGE_SIZE, people.length)} of {people.length} contributors · Totals include all matching pages</span>
      <div className="flex items-center gap-3"><button type="button" disabled={!currentPage} onClick={() => setPage(currentPage - 1)} className="rounded border border-jira-border px-3 py-1.5 disabled:opacity-40">Previous</button><span>{currentPage + 1} / {pages}</span><button type="button" disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)} className="rounded border border-jira-border px-3 py-1.5 disabled:opacity-40">Next</button></div>
    </div>
  </section>;
}

"use client";

import { useState } from "react";
import type { ContributorMetrics } from "@/lib/jira/contributorMetrics";
import { ContributorDetailsModal } from "./ContributorDetailsModal";

const format = (value: number, digits = 2) => value.toLocaleString(undefined, { maximumFractionDigits: digits });
const rate = (value: number) => value.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const PAGE_SIZE = 20;

export function ContributorSummary({ data, scopeLabel, jiraDomain }: { data: ContributorMetrics; scopeLabel: string; jiraDomain?: string }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("name");
  const [selectedName, setSelectedName] = useState<string | null>(null);
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
  const selectedPerson = data.people.find((person) => person.name === selectedName);

  return <section className="overflow-hidden rounded-lg border border-jira-border bg-white shadow-sm" aria-label="Contributor contribution and efficiency">
    <div className="border-b border-jira-border px-5 py-4">
      <h3 className="text-sm font-bold text-jira-text">Contribution & Efficiency</h3>
      <p className="mt-1 text-xs text-jira-text-muted">{scopeLabel} · {data.people.length} contributors</p>
      <p className="mt-2 text-xs text-jira-text-muted">Attributed Story Points are awarded when a story is completed, based on each contributor’s share of its subtask Original Estimates. Efficiency = Attributed Story Points ÷ Logged Effort.</p>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-jira-border px-5 py-3">
      <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Search contributors…" aria-label="Search contributors" className="min-w-48 rounded border border-jira-border px-3 py-2 text-xs" />
      <select value={sort} aria-label="Sort contributors" className="rounded border border-jira-border bg-white px-3 py-2 text-xs" onChange={(event) => { setSort(event.target.value); setPage(0); }}>
        <option value="name">Name: A–Z</option>
        <option value="efficiency-desc">Efficiency: highest first</option>
        <option value="efficiency-asc">Efficiency: lowest first</option>
        <option value="points">Attributed SP: highest first</option>
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
          {people.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((person) => <tr key={person.name}
            role="button" tabIndex={0} aria-haspopup="dialog" aria-label={`View contribution details for ${person.name}`}
            onClick={() => setSelectedName(person.name)}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedName(person.name); } }}
            className="cursor-pointer hover:bg-jira-bg/40 focus-visible:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-jira-blue">
            <td className="px-4 py-3 font-semibold text-jira-blue">{person.name}</td><td className="px-4 py-3 text-right tabular-nums">{person.subtaskCount}</td>
            <td className="px-4 py-3 text-right tabular-nums">{format(person.originalEstimateHours)}</td><td className="px-4 py-3 text-right tabular-nums">{format(person.loggedEffortHours)}</td>
            <td className="px-4 py-3 text-right font-semibold tabular-nums text-jira-blue">{format(person.attributedStoryPoints)}</td>
            <td className="px-4 py-3 text-right tabular-nums" title={person.efficiency === null ? "No logged effort in the selected scope" : person.attributedStoryPoints === 0 ? "No attributed points from completed stories in this scope; logged effort is present" : "Attributed Story Points divided by Logged Effort"}>{person.efficiency === null ? "N/A" : rate(person.efficiency)}</td>
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
    {selectedPerson && <ContributorDetailsModal key={selectedPerson.name} person={selectedPerson} scopeLabel={scopeLabel} jiraDomain={jiraDomain} onClose={() => setSelectedName(null)} />}
  </section>;
}

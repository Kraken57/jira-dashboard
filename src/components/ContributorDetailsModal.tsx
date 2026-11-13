"use client";

import { useState, type CSSProperties } from "react";
import { DetailModal } from "./DetailModal";
import { JiraWorkLink } from "./JiraWorkLink";
import type { IndividualContribution } from "@/lib/jira/contributorMetrics";

const number = (value: number, digits = 2) => value.toLocaleString(undefined, { maximumFractionDigits: digits });
const rate = (value: number) => value.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const date = (value: string) => new Date(value).toLocaleDateString("en-US", {
  month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
}).toUpperCase();

export function ContributorDetailsModal({ person, scopeLabel, jiraDomain, onClose }: {
  person: IndividualContribution;
  scopeLabel: string;
  jiraDomain?: string;
  onClose: () => void;
}) {
  const cards = person.sprintDetails || [];
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const current = Math.min(index, Math.max(0, cards.length - 1));
  const card = cards[current];
  const move = (next: number) => {
    if (next < 0 || next >= cards.length || next === current) return;
    setDirection(next > current ? 1 : -1);
    setIndex(next);
  };

  return <DetailModal title={`Contribution · ${person.name}`} subtitle={scopeLabel} wide onClose={onClose}>
    <div className="space-y-4 p-4 sm:p-5">
      <div className="rounded-lg border border-jira-border bg-slate-50 px-4 py-3 text-xs text-jira-text-muted">
        <p className="font-semibold text-jira-text">Overall · selected filters</p>
        <p className="mt-1">{person.subtaskCount} subtasks · {number(person.originalEstimateHours)} hrs Original Estimates · {number(person.loggedEffortHours)} hrs Logged Effort · <strong>{number(person.attributedStoryPoints)} attributed SP</strong> · Efficiency: <strong>{person.efficiency === null ? "N/A" : `${rate(person.efficiency)} SP/hour`}</strong></p>
      </div>
      {!card ? <p className="rounded border border-jira-border p-5 text-sm text-jira-text-muted">No sprint breakdown is available for this contributor in the selected filters.</p> : <>
        <nav aria-label="Contributor sprint cards" className="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-white py-2">
          <button type="button" aria-label="Previous sprint card" disabled={!current} onClick={() => move(current - 1)} className="rounded-md border border-jira-border px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-40">← Previous</button>
          <label className="min-w-0 flex-1 text-xs text-jira-text-muted">
            <span className="sr-only">Select pod and sprint</span>
            <select aria-label="Select pod and sprint" title={`${card.sprintName} · ${card.podName}`} value={current} onChange={(event) => move(Number(event.target.value))} className="w-full max-w-full rounded-md border border-jira-border bg-white px-2 py-2 text-jira-text">
              {cards.map((entry, position) => <option key={entry.id} value={position} title={`${entry.sprintName} · ${entry.podName}`}>{entry.sprintName} · {entry.podName}</option>)}
            </select>
          </label>
          <button type="button" aria-label="Next sprint card" disabled={current >= cards.length - 1} onClick={() => move(current + 1)} className="rounded-md border border-jira-border px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-40">Next →</button>
        </nav>
        <p className="text-xs text-jira-text-muted" aria-live="polite">Card {current + 1} of {cards.length} · Oldest to newest · {card.podName} · {card.sprintName}</p>
        <div className="overflow-hidden px-1 pb-2 pt-3 sm:px-3">
          <article key={card.id} className="contributor-sprint-card relative rounded-xl border border-jira-border bg-white shadow-md" style={{ "--contributor-direction": direction } as CSSProperties}>
            <div className="rounded-t-xl border-b border-jira-border bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-jira-blue">{card.podName} <span className="font-normal">({card.podKey})</span></p>
              <h4 className="mt-1 break-words text-sm font-bold text-jira-text">{card.sprintName}</h4>
              <div className="mt-2 space-y-1 text-xs text-jira-text-muted">
                {card.dateRanges.length ? card.dateRanges.map((range) => <p key={`${range.startDate}/${range.endDate}`} title={`${range.startDate} – ${range.endDate}`}>{date(range.startDate)} – {date(range.endDate)} <span className="text-[10px]">UTC</span></p>) : <p>Sprint dates unavailable</p>}
                <p>{card.contributorCount} contributors in this pod and sprint</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-5">
              {[
                ["Subtask Count", String(card.subtaskCount)],
                ["Original Estimates", `${number(card.originalEstimateHours)} hrs`],
                ["Logged Effort", `${number(card.loggedEffortHours)} hrs`],
                ["Attributed Story Points", number(card.attributedStoryPoints)],
                ["Efficiency", card.efficiency === null ? "N/A" : `${rate(card.efficiency)} SP/hour`],
              ].map(([label, value]) => <div key={label} className="rounded-lg border border-jira-border bg-slate-50 px-3 py-3"><p className="text-[11px] text-jira-text-muted">{label}</p><p className="mt-1 text-sm font-bold tabular-nums text-jira-text">{value}</p></div>)}
            </div>
            <div className="space-y-4 px-4 pb-4">
              <div className="rounded-lg bg-blue-50 px-3 py-3 text-xs leading-relaxed text-jira-text-muted">
                <p><strong>Efficiency:</strong> {number(card.attributedStoryPoints)} attributed SP ÷ {number(card.loggedEffortHours)} hrs Logged Effort = {card.efficiency === null ? "N/A (no logged effort in this selected work)" : `${rate(card.efficiency)} SP/hour`}.</p>
                <p className="mt-1">Attributed points are credited only when a parent story is completed. Work on an open story can have Original Estimates and Logged Effort but still show 0 attributed points and 0 efficiency until the story is completed. Estimates and logged hours follow assigned work in this sprint, as in Capacity View.</p>
              </div>
              <section aria-label="Story point calculations">
                <h5 className="mb-2 text-xs font-bold text-jira-text">Story point calculations · {card.allocations.length} completed stories</h5>
                {!card.allocations.length && <p className="rounded-lg border border-jira-border p-3 text-xs text-jira-text-muted">No completed story has allocated points to this contributor in this sprint. Open stories do not receive attributed points until completion. Assigned work and logged effort are listed below.</p>}
                <div className="space-y-2">{card.allocations.map((allocation) => <details key={allocation.storyKey} className="rounded-lg border border-jira-border bg-white">
                  <summary className="cursor-pointer px-3 py-3 text-xs focus-visible:outline-jira-blue">
                    <span className="font-semibold text-jira-text">{allocation.storyKey}</span> · {number(allocation.attributedStoryPoints)} attributed SP
                    <span className="mt-1 block break-words text-jira-text-muted" title={allocation.summary}>{allocation.summary}</span>
                    <span className="mt-1 block text-jira-text-muted">{number(allocation.originalEstimateHours)} / {number(allocation.totalStoryEstimateHours)} estimated hrs × {number(allocation.storyPoints)} SP = {number(allocation.attributedStoryPoints)} SP ({number(allocation.share * 100)}% share)</span>
                  </summary>
                  <div className="space-y-2 border-t border-jira-border px-3 py-3 text-xs">
                    <p>Story: <JiraWorkLink issueKey={allocation.storyKey} jiraDomain={jiraDomain} /> · Story estimate total includes all fetched contributors’ noncanceled subtasks.</p>
                    <p className="text-jira-text-muted">Subtasks giving {person.name} this share (they may have been worked in an earlier sprint):</p>
                    <ul className="space-y-2">{allocation.subtasks.map((item) => <li key={item.key} className="rounded bg-slate-50 p-2">
                      <JiraWorkLink issueKey={item.key} jiraDomain={jiraDomain} /> <span className="text-jira-text-muted">· {item.status}</span>
                      <p className="mt-1 break-words" title={item.summary}>{item.summary}</p>
                      <p className="mt-1 text-jira-text-muted">Original Estimates: {number(item.originalEstimateHours)} hrs · Logged Effort: {number(item.loggedEffortHours)} hrs</p>
                    </li>)}</ul>
                  </div>
                </details>)}</div>
              </section>
              <section aria-label="Assigned stories and subtasks">
                <h5 className="mb-2 text-xs font-bold text-jira-text">Assigned stories and subtasks · {card.workItems.length} work items</h5>
                {!card.workItems.length ? <p className="rounded border border-jira-border p-3 text-xs text-jira-text-muted">No assigned work in this sprint. The completed-story calculation above explains this card’s point credit.</p> : <div className="overflow-hidden rounded-lg border border-jira-border">
                  <div className="hidden grid-cols-[minmax(0,1fr)_6rem_6rem] gap-3 bg-slate-50 px-3 py-2 text-xs font-semibold text-jira-text-muted sm:grid">
                    <span>Work item</span><span className="text-right">Original Estimates<br /><span className="font-normal">Hours</span></span><span className="text-right">Logged Effort<br /><span className="font-normal">Hours</span></span>
                  </div>
                  <ul className="divide-y divide-jira-border">{card.workItems.map((item) => <li key={item.key} className="grid grid-cols-2 items-start gap-3 p-3 text-xs sm:grid-cols-[minmax(0,1fr)_6rem_6rem]">
                    <div className="col-span-2 min-w-0 sm:col-span-1"><JiraWorkLink issueKey={item.key} jiraDomain={jiraDomain} /><span className="ml-2 text-[10px] text-jira-text-muted">{item.workType} · {item.status}</span><p className="mt-1 break-words" title={item.summary}>{item.summary}</p></div>
                    <div className="tabular-nums sm:text-right"><span className="mb-1 block text-[10px] text-jira-text-muted sm:hidden">Original Estimates (hrs)</span>{number(item.originalEstimateHours)}</div>
                    <div className="text-right tabular-nums"><span className="mb-1 block text-[10px] text-jira-text-muted sm:hidden">Logged Effort (hrs)</span>{number(item.loggedEffortHours)}</div>
                  </li>)}</ul>
                </div>}
              </section>
            </div>
          </article>
        </div>
        <p className="text-[11px] leading-relaxed text-jira-text-muted">Each card is a sprint work snapshot. Carried work can appear in multiple snapshots; the overall totals count each work item once. Logged Effort uses the current-assignee totals already shown in Capacity View.</p>
      </>}
    </div>
  </DetailModal>;
}

"use client";

import { useMemo, useState } from "react";
import { DetailModal } from "./DetailModal";
import { IssueRow, MetricInsight } from "@/lib/jira/types";
import { getMetricDefinition } from "@/lib/jira/metricDefinitions";

interface IssuesModalProps {
  title: string;
  subtitle?: string;
  issues: IssueRow[];
  jiraDomain?: string;
  onClose: () => void;
  emptyText?: string;
  insight?: MetricInsight;
}

type StateFilter = "all" | "open" | "done";
type SortOrder = "default" | "sp-desc" | "sp-asc" | "key";

const UNIT_LABEL: Record<"pp" | "%" | "SP", string> = {
  pp: "percentage points",
  "%": "percent change",
  SP: "story points",
};

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function sprintNames(value: string) {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function IssuesModal({
  title,
  subtitle,
  issues,
  jiraDomain,
  onClose,
  emptyText,
  insight,
}: IssuesModalProps) {
  const [search, setSearch] = useState("");
  const [state, setState] = useState<StateFilter>("all");
  const [status, setStatus] = useState("all");
  const [workType, setWorkType] = useState("all");
  const [assignee, setAssignee] = useState("all");
  const [sprint, setSprint] = useState("all");
  const [reason, setReason] = useState("all");
  const [sort, setSort] = useState<SortOrder>("default");

  const detail: MetricInsight = insight ?? getMetricDefinition(title);
  const totalSP = issues.reduce((a, i) => a + (i.storyPoints || 0), 0);
  const doneIssues = issues.filter((i) => i.isDone);
  const doneSP = doneIssues.reduce((a, i) => a + (i.storyPoints || 0), 0);
  const completion = issues.length > 0 ? Math.round((doneIssues.length / issues.length) * 100) : 0;
  const hasReason = issues.some((i) => i.reason);

  const statuses = useMemo(() => unique(issues.map((i) => i.status)), [issues]);
  const workTypes = useMemo(() => unique(issues.map((i) => i.workType)), [issues]);
  const assignees = useMemo(() => unique(issues.map((i) => i.assignee)), [issues]);
  const sprints = useMemo(
    () => unique(issues.flatMap((i) => sprintNames(i.sprint))),
    [issues]
  );
  const reasons = useMemo(
    () => unique(issues.map((i) => i.reason || "")),
    [issues]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = issues.filter((issue) => {
      if (state === "done" && !issue.isDone) return false;
      if (state === "open" && issue.isDone) return false;
      if (status !== "all" && issue.status !== status) return false;
      if (workType !== "all" && issue.workType !== workType) return false;
      if (assignee !== "all" && issue.assignee !== assignee) return false;
      if (sprint !== "all" && !sprintNames(issue.sprint).includes(sprint)) return false;
      if (reason !== "all" && (issue.reason || "") !== reason) return false;
      if (q) {
        const haystack = `${issue.key} ${issue.summary} ${issue.assignee} ${issue.status}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    if (sort === "sp-desc") return [...result].sort((a, b) => b.storyPoints - a.storyPoints);
    if (sort === "sp-asc") return [...result].sort((a, b) => a.storyPoints - b.storyPoints);
    if (sort === "key") return [...result].sort((a, b) => a.key.localeCompare(b.key));
    return result;
  }, [issues, search, state, status, workType, assignee, sprint, reason, sort]);

  const filteredSP = filtered.reduce((a, i) => a + (i.storyPoints || 0), 0);
  const hasFilters =
    search.trim() !== "" ||
    state !== "all" ||
    status !== "all" ||
    workType !== "all" ||
    assignee !== "all" ||
    sprint !== "all" ||
    reason !== "all" ||
    sort !== "default";

  const resetFilters = () => {
    setSearch("");
    setState("all");
    setStatus("all");
    setWorkType("all");
    setAssignee("all");
    setSprint("all");
    setReason("all");
    setSort("default");
  };

  const trend = detail.trend;
  const trendLevelUnit = trend ? (trend.unit === "pp" ? "%" : trend.unit) : "%";
  const trendGood =
    trend && trend.delta !== 0
      ? trend.better === "up"
        ? trend.delta > 0
        : trend.delta < 0
      : null;
  const target = detail.target;
  const targetCurrent = target?.current ?? trend?.current ?? 0;
  const targetMet =
    target &&
    (target.direction === "atLeast"
      ? targetCurrent >= target.value
      : targetCurrent <= target.value);
  const targetProgress = target
    ? target.direction === "atLeast"
      ? Math.min(100, target.value > 0 ? (targetCurrent / target.value) * 100 : 0)
      : targetCurrent > 0
      ? Math.min(100, (target.value / targetCurrent) * 100)
      : 100
    : 0;

  return (
    <DetailModal title={title} subtitle={subtitle} onClose={onClose} wide>
      <div className="px-5 py-4 border-b border-jira-border bg-jira-bg/40 space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2 bg-white border border-jira-border rounded-lg p-3">
            <p className="text-[11px] uppercase tracking-wider font-bold text-jira-text-muted">
              What this means
            </p>
            <p className="text-sm text-jira-text mt-1.5 leading-snug">{detail.what}</p>
            {detail.formula && (
              <p className="text-xs text-jira-text-muted mt-2">
                <span className="font-semibold text-jira-text">Formula:</span> {detail.formula}
              </p>
            )}
            {detail.calculation && (
              <p className="text-xs text-jira-blue mt-1 font-medium">{detail.calculation}</p>
            )}
          </div>

          <div className="bg-white border border-jira-border rounded-lg p-3">
            <p className="text-[11px] uppercase tracking-wider font-bold text-jira-text-muted">
              Current vs previous
            </p>
            {trend ? (
              <>
                <p
                  className={`text-2xl font-bold mt-1 ${
                    trendGood === null
                      ? "text-jira-text-muted"
                      : trendGood
                      ? "text-jira-green"
                      : "text-jira-red"
                  }`}
                >
                  {trend.delta > 0 ? "+" : ""}
                  {trend.delta}
                  {trend.unit}
                </p>
                <p className="text-xs text-jira-text-muted mt-1">
                  {trend.currentLabel}: {trend.current}
                  {trendLevelUnit} · {trend.previousLabel}: {trend.previous}
                  {trendLevelUnit}
                </p>
                <p className="text-[11px] text-jira-text-light mt-1">
                  {UNIT_LABEL[trend.unit]}
                  {trendGood === null
                    ? " · unchanged"
                    : trendGood
                    ? " · improving"
                    : " · worsening"}
                </p>
              </>
            ) : (
              <p className="text-xs text-jira-text-muted mt-2">
                Not enough sprint history to compare yet.
              </p>
            )}
          </div>

          <div className="bg-white border border-jira-border rounded-lg p-3">
            <p className="text-[11px] uppercase tracking-wider font-bold text-jira-text-muted">
              Target
            </p>
            {target ? (
              <>
                <p className="text-sm font-bold text-jira-text mt-1">
                  {target.direction === "atLeast" ? "≥" : "≤"} {target.value}
                  {target.unit}
                  <span className="text-xs font-medium text-jira-text-muted ml-1">
                    {target.label}
                  </span>
                </p>
                <p className="text-xs text-jira-text-muted mt-1">
                  Now: {targetCurrent}
                  {target.unit}
                </p>
                <div className="w-full bg-jira-bg h-1.5 rounded-full overflow-hidden mt-2">
                  <div
                    className={`h-1.5 rounded-full ${targetMet ? "bg-jira-green" : "bg-jira-amber"}`}
                    style={{ width: `${targetProgress}%` }}
                  />
                </div>
                <p
                  className={`text-[11px] font-semibold mt-1 ${
                    targetMet ? "text-jira-green" : "text-jira-amber"
                  }`}
                >
                  {targetMet ? "On target" : "Outside target"}
                </p>
              </>
            ) : (
              <p className="text-xs text-jira-text-muted mt-2">
                No fixed target. Compare with the previous sprint and other pods.
              </p>
            )}
          </div>
        </div>

        {detail.howToCompare && (
          <p className="text-xs text-jira-text-muted leading-relaxed">
            <span className="font-semibold text-jira-text">How to compare: </span>
            {detail.howToCompare}
          </p>
        )}

        {detail.recent && detail.recent.length > 0 && (
          <div>
            <p className="text-[11px] uppercase tracking-wider font-bold text-jira-text-muted mb-1.5">
              Recent sprints
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {detail.recent.map((row) => (
                <div
                  key={row.label}
                  className="bg-white border border-jira-border rounded-lg px-3 py-2"
                >
                  <p className="text-[11px] font-semibold text-jira-text-muted truncate">
                    {row.label}
                  </p>
                  <p className="text-sm font-bold text-jira-text">{row.value}</p>
                  {row.detail && (
                    <p className="text-[11px] text-jira-text-light">{row.detail}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {detail.takeaways && detail.takeaways.length > 0 && (
          <ul className="list-disc pl-4 space-y-1 text-xs text-jira-text-muted">
            {detail.takeaways.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="px-5 py-3 border-b border-jira-border flex flex-wrap gap-x-4 gap-y-1 text-xs text-jira-text-muted">
        <span>
          <strong className="text-jira-text">{issues.length}</strong> work items
        </span>
        <span>
          <strong className="text-jira-text">{totalSP}</strong> SP
        </span>
        <span>
          <strong className="text-jira-green">{doneIssues.length}</strong> done
        </span>
        <span>
          <strong className="text-jira-blue">{issues.length - doneIssues.length}</strong> open
        </span>
        <span>
          <strong className="text-jira-text">{completion}%</strong> complete
        </span>
        <span>
          <strong className="text-jira-green">{doneSP}</strong> SP delivered
        </span>
      </div>

      <div className="px-5 py-3 border-b border-jira-border bg-white space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search key, summary, assignee…"
            aria-label="Search work items"
            className="flex-1 min-w-[180px] text-xs border border-jira-border rounded-md px-2.5 py-1.5 focus:outline-none focus:border-jira-blue"
          />
          <select
            value={state}
            onChange={(e) => setState(e.target.value as StateFilter)}
            aria-label="Filter by completion"
            className="text-xs border border-jira-border rounded-md px-2 py-1.5 bg-white focus:outline-none focus:border-jira-blue"
          >
            <option value="all">All work</option>
            <option value="open">Open only</option>
            <option value="done">Done only</option>
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter by status"
            className="text-xs border border-jira-border rounded-md px-2 py-1.5 bg-white focus:outline-none focus:border-jira-blue"
          >
            <option value="all">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={workType}
            onChange={(e) => setWorkType(e.target.value)}
            aria-label="Filter by type"
            className="text-xs border border-jira-border rounded-md px-2 py-1.5 bg-white focus:outline-none focus:border-jira-blue"
          >
            <option value="all">All types</option>
            {workTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            aria-label="Filter by assignee"
            className="text-xs border border-jira-border rounded-md px-2 py-1.5 bg-white focus:outline-none focus:border-jira-blue"
          >
            <option value="all">All assignees</option>
            {assignees.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select
            value={sprint}
            onChange={(e) => setSprint(e.target.value)}
            aria-label="Filter by sprint"
            className="text-xs border border-jira-border rounded-md px-2 py-1.5 bg-white focus:outline-none focus:border-jira-blue"
          >
            <option value="all">All sprints</option>
            {sprints.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {hasReason && (
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-label="Filter by reason"
              className="text-xs border border-jira-border rounded-md px-2 py-1.5 bg-white focus:outline-none focus:border-jira-blue"
            >
              <option value="all">All reasons</option>
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          )}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOrder)}
            aria-label="Sort work items"
            className="text-xs border border-jira-border rounded-md px-2 py-1.5 bg-white focus:outline-none focus:border-jira-blue"
          >
            <option value="default">Default order</option>
            <option value="sp-desc">SP high → low</option>
            <option value="sp-asc">SP low → high</option>
            <option value="key">Key A → Z</option>
          </select>
          {hasFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs font-semibold text-jira-blue hover:underline px-1"
            >
              Reset
            </button>
          )}
        </div>
        <p className="text-[11px] text-jira-text-muted">
          Showing <strong className="text-jira-text">{filtered.length}</strong> of {issues.length} items ·{" "}
          <strong className="text-jira-text">{filteredSP}</strong> SP
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-jira-bg text-jira-text-muted text-xs uppercase border-b border-jira-border font-semibold">
            <tr>
              <th className="px-4 py-2.5">Key</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5">Summary</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5 text-center">SP</th>
              <th className="px-4 py-2.5">Assignee</th>
              <th className="px-4 py-2.5">Sprint</th>
              {hasReason && <th className="px-4 py-2.5">Reason</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-jira-border/60">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={hasReason ? 8 : 7}
                  className="px-5 py-10 text-center text-jira-text-muted"
                >
                  {hasFilters
                    ? "No work items match these filters."
                    : emptyText || "No work items for this selection."}
                </td>
              </tr>
            ) : (
              filtered.map((issue) => (
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
                  {hasReason && (
                    <td className="px-4 py-2.5 text-xs text-jira-text-muted">
                      {issue.reason || "—"}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </DetailModal>
  );
}

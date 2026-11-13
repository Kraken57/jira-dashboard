/**
 * Forge Dashboard Resolver - Custom UI global page.
 * Serves KPI data from live Jira via api.asApp().
 * No imports from frontend code. Backend is fully segregated.
 * Real Jira data only. No dummy data, no CSV, no JSON fallback.
 */
import Resolver from "@forge/resolver";
import api, { route } from "@forge/api";
import { kvs } from "./kvsClient";
import zlib from "node:zlib";
import { createHash } from "node:crypto";
import { JiraClient } from "./api/jiraClient";

const resolver = new Resolver();
const jiraClient = new JiraClient();

/**
 * Statuses that count as "delivered". Configurable per Jira site via
 * JIRA_DONE_STATUSES (comma-separated). Set it with `forge env` / the
 * environment variables section of the Forge developer console.
 */
const DONE_STATUSES = new Set(
  (process.env.JIRA_DONE_STATUSES || "Done,Accepted,Released,Closed,Resolved")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

function isDoneStatus(status: string): boolean {
  return DONE_STATUSES.has(status);
}

const SUBTASK_DONE_STATUSES = new Set(
  (
    process.env.JIRA_SUBTASK_DONE_STATUSES ||
    "Done,Closed,Resolved,Completed,Released,Accepted"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

function isSubtaskDoneStatus(status: string): boolean {
  return DONE_STATUSES.has(status) || SUBTASK_DONE_STATUSES.has(status);
}

/**
 * Derive the enterprise quarter id from a Jira sprint name.
 *   "2026-Q3 Iteration 1"          -> "CY26 PI.3"
 *   "DTR 2026 - Q4 - Iteration 2"  -> "CY26 PI.4"
 *   "CY26 PI.3 Sprint 1"           -> "CY26 PI.3"
 */
function quarterFromSprint(sprintName: string): string {
  if (!sprintName) return "All";

  const yq = sprintName.match(/(\d{4})\s*-\s*Q\s*(\d)/i);
  if (yq) {
    return `CY${yq[1].slice(2)} PI.${parseInt(yq[2], 10)}`;
  }

  const pi = sprintName.match(/CY(\d{2})\s*PI\.?\s*(\d)/i);
  if (pi) {
    return `CY${pi[1]} PI.${parseInt(pi[2], 10)}`;
  }

  return "All";
}

/**
 * Read field configuration from Forge key-value storage.
 * Falls back to sensible defaults if not configured by admin.
 */
let ahaFieldLookup: Promise<string | undefined> | undefined;
async function resolveAhaUrlField(): Promise<string | undefined> {
  if (process.env.JIRA_AHA_URL_FIELD?.trim()) return process.env.JIRA_AHA_URL_FIELD.trim();
  if (!ahaFieldLookup) ahaFieldLookup = (async () => {
    try {
      const response = await api.asApp().requestJira(route`/rest/api/3/field`, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`Field lookup returned ${response.status}`);
      const fields = await response.json() as { id: string; name: string }[];
      const matches = fields.filter((field) => field.name.toLowerCase().replace(/[^a-z0-9]/g, "") === "ahaurl");
      if (matches.length !== 1) throw new Error(`Expected one Aha URL field, found ${matches.length}`);
      console.info("[AUDIT_FIELD] Planning-link field resolved", { fieldId: matches[0].id });
      return matches[0].id;
    } catch (error) {
      console.warn("[AUDIT_FIELD] Planning-link field unavailable", { message: error instanceof Error ? error.message : "Field lookup failed" });
      return undefined;
    }
  })();
  const result = await ahaFieldLookup;
  if (!result) ahaFieldLookup = undefined;
  return result;
}

async function getFieldConfig(): Promise<{
  jql: string;
  storyPointsField: string;
  sprintField: string;
  podField: string;
  ahaUrlField?: string;
}> {
  const [jql, spField, sprintField, podField] = await Promise.all([
    kvs.get("jira_jql"),
    kvs.get("jira_story_points_field"),
    kvs.get("jira_sprint_field"),
    kvs.get("jira_pod_field"),
  ]);

  // Precedence: saved admin-page value, then forge variables, then the
  // app-site defaults the manifest was written for.
  return {
    ahaUrlField: await resolveAhaUrlField(),
    jql:
      (jql as string) ||
      process.env.JIRA_JQL ||
      "project in (DTR)",
    storyPointsField:
      (spField as string) ||
      process.env.JIRA_STORY_POINTS_FIELD ||
      "customfield_10078",
    sprintField:
      (sprintField as string) ||
      process.env.JIRA_SPRINT_FIELD ||
      "customfield_10020",
    podField:
      (podField as string) ||
      process.env.JIRA_POD_FIELD ||
      "customfield_10001",
  };
}

const DAY_MS = 86_400_000;
const RATE_WINDOW_DAYS = 30;

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/** Weekdays between two instants; the deadline day is excluded. */
function workingDaysBetween(startMs: number, endMs: number): number {
  const cursor = new Date(startMs);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(endMs);
  end.setHours(0, 0, 0, 0);
  let days = 0;
  while (cursor < end) {
    if (!isWeekend(cursor)) days += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/**
 * Future Predictability — same math as the frontend metrics engine.
 * Remaining work is the sum of open child story points; a feature's own points
 * are used only when it has no estimated children. Capacity uses weekdays.
 */
function computeFuturePredictability(items: any[], childSource: any[] = items) {
  const now = Date.now();
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const rateStart = startOfToday - RATE_WINDOW_DAYS * DAY_MS;
  const recentDoneSP = childSource
    .filter(
      (it: any) =>
        isDoneStatus(it.status) &&
        it.resolutionDate &&
        new Date(it.resolutionDate).getTime() >= rateStart &&
        new Date(it.resolutionDate).getTime() <= now
    )
    .reduce((sum: number, it: any) => sum + (it.storyPoints || 0), 0);
  const rateWorkingDays = Math.max(1, workingDaysBetween(rateStart, now + DAY_MS));
  const dailyRate = recentDoneSP / rateWorkingDays;

  const hasFeatureType = childSource.some((it: any) => /^feature$/i.test(it.workType));
  const isFeature = (it: any) =>
    hasFeatureType ? /^feature$/i.test(it.workType) : /^epic$/i.test(it.workType);

  const isFutureDated = (it: any) =>
    !!it.dueDate && new Date(it.dueDate).getTime() >= startOfToday;

  const childrenByParent = new Map<string, any[]>();
  childSource.forEach((it: any) => {
    if (!it.parentKey) return;
    if (/^sub-?task$/i.test(it.workType)) return;
    if (!childrenByParent.has(it.parentKey)) childrenByParent.set(it.parentKey, []);
    childrenByParent.get(it.parentKey)!.push(it);
  });

  const remainingUnder = (
    item: any,
    seen = new Set<string>()
  ): { remaining: number; hasEstimate: boolean } => {
    if (seen.has(item.key)) return { remaining: 0, hasEstimate: false };
    seen.add(item.key);
    const children = childrenByParent.get(item.key) || [];
    if (children.length === 0) {
      const sp = item.storyPoints || 0;
      return { remaining: isDoneStatus(item.status) ? 0 : sp, hasEstimate: sp > 0 };
    }
    let remaining = 0;
    let hasEstimate = false;
    for (const child of children) {
      const childResult = remainingUnder(child, seen);
      hasEstimate = hasEstimate || childResult.hasEstimate;
      if (!isDoneStatus(child.status)) remaining += childResult.remaining;
    }
    if (!hasEstimate && (item.storyPoints || 0) > 0) {
      return {
        remaining: isDoneStatus(item.status) ? 0 : item.storyPoints || 0,
        hasEstimate: true,
      };
    }
    return { remaining, hasEstimate };
  };

  const planned = items.filter(
    (it: any) => isFeature(it) && !isDoneStatus(it.status) && isFutureDated(it)
  );
  const pastDue = items.filter(
    (it: any) => isFeature(it) && !isDoneStatus(it.status) && !isFutureDated(it) && !!it.dueDate
  );

  const forecastable = planned.filter((it: any) => remainingUnder(it).hasEstimate);
  const onTimeCount = forecastable.filter((it: any) => {
    const { remaining } = remainingUnder(it);
    if (dailyRate <= 0) return remaining === 0;
    const days = workingDaysBetween(startOfToday, new Date(it.dueDate).getTime());
    return remaining <= dailyRate * days;
  }).length;

  const reasons = new Map<string, string>();
  planned.forEach((it: any) => {
    const { remaining, hasEstimate } = remainingUnder(it);
    if (!hasEstimate) {
      reasons.set(it.key, "No Estimate (add story points to child work)");
      return;
    }
    if (dailyRate <= 0) {
      reasons.set(
        it.key,
        remaining === 0 ? "On Forecast (no remaining work)" : "At Risk (no recent delivery rate)"
      );
      return;
    }
    const days = workingDaysBetween(startOfToday, new Date(it.dueDate).getTime());
    const capacity = Math.round(dailyRate * days * 10) / 10;
    reasons.set(
      it.key,
      remaining <= dailyRate * days
        ? `On Forecast (${remaining} SP ≤ ${capacity} SP capacity in ${days} working days)`
        : `At Risk (${remaining} SP > ${capacity} SP capacity in ${days} working days)`
    );
  });
  pastDue.forEach((it: any) => reasons.set(it.key, "Past Due (missed due date)"));

  return {
    dailyRate: Math.round(dailyRate * 10) / 10,
    rateWorkingDays,
    plannedCount: planned.length,
    forecastableCount: forecastable.length,
    unestimatedCount: planned.length - forecastable.length,
    onTimeCount,
    pastDueCount: pastDue.length,
    score:
      forecastable.length > 0
        ? Math.round((onTimeCount / forecastable.length) * 100)
        : 0,
    reasons,
  };
}

/**
 * Transform a raw Jira issue into a work item for dashboard calculations.
 */
function mapIssueToWorkItem(
  issue: Record<string, unknown>,
  config: { storyPointsField: string; sprintField: string; podField: string; ahaUrlField?: string }
): any {
  const fields = (issue.fields || {}) as Record<string, unknown>;
  const project = (fields.project || {}) as Record<string, string>;
  const issuetype = (fields.issuetype || {}) as Record<string, string>;
  const status = (fields.status || {}) as Record<string, string>;
  const summary = String(fields.summary || "");
  const issueKey = String(issue.key || "");
  const workType = issuetype.name || "Story";

  const spRaw = fields[config.storyPointsField];
  const storyPoints =
    typeof spRaw === "number" ? spRaw : parseFloat(String(spRaw || "0")) || 0;

  const sprintObj = fields[config.sprintField];
  const sprints: string[] = [];
  if (Array.isArray(sprintObj)) {
    for (const s of sprintObj) {
      if (s && typeof s.name === "string") {
        s.name.split(",").forEach((part: string) => {
          const trimmed = part.trim();
          if (trimmed && !sprints.includes(trimmed)) sprints.push(trimmed);
        });
      }
    }
  } else if (typeof sprintObj === "string") {
    sprintObj.split(",").forEach((part: string) => {
      const trimmed = part.trim();
      if (trimmed && !sprints.includes(trimmed)) sprints.push(trimmed);
    });
  }

  const podValue = fields[config.podField];
  const podKey =
    typeof podValue === "string" ? podValue : project.key || "DTR";
  const podName =
    typeof podValue === "string" ? podValue : project.name || "DTR Project";

  const assigneeObj = fields.assignee as { displayName?: string } | undefined;
  const reporterObj = fields.reporter as { displayName?: string } | undefined;
  const priorityObj = fields.priority as { name?: string } | undefined;
  const parentObj = fields.parent as { key?: string; id?: string; fields?: { issuetype?: { name?: string } } } | undefined;
  const epicLink =
    typeof fields.customfield_10014 === "string"
      ? fields.customfield_10014
      : "";

  return {
    key: issueKey,
    summary,
    podKey,
    podName,
    workType,
    status: status.name || "To Do",
    priority: priorityObj?.name || "Unspecified",
    assignee: assigneeObj?.displayName || "Unassigned",
      quarter: sprints.length > 0 ? quarterFromSprint(sprints[0]) : "All",
    sprints,
    storyPoints,
    team: project.name || "",
    projectKey: project.key || "UNKNOWN",
    projectName: project.name || project.key || "Unknown project",
    reporter: reporterObj?.displayName || "Unassigned",
    parentKey: parentObj?.key || epicLink || "",
    parentWorkType: parentObj?.fields?.issuetype?.name || "",
      ahaUrl: config.ahaUrlField && Object.prototype.hasOwnProperty.call(fields, config.ahaUrlField)
        ? String(fields[config.ahaUrlField!] ?? "").trim() : undefined,
    parentId: parentObj?.id || "",
    createdDate: String(fields.created || ""),
    resolutionDate: fields.resolutiondate ? String(fields.resolutiondate) : undefined,
    dueDate: fields.duedate ? String(fields.duedate) : undefined,
    originalEstimateSeconds: Number(fields.timeoriginalestimate ?? (fields.timetracking as { originalEstimateSeconds?: number } | undefined)?.originalEstimateSeconds) || 0,
    timeSpentSeconds: Number(fields.timespent) || 0,
      hasOriginalEstimate: fields.timeoriginalestimate != null || (fields.timetracking as { originalEstimateSeconds?: number } | undefined)?.originalEstimateSeconds != null,
    updatedDate: String(fields.updated || ""),
  };
}

/**
 * Sub-tasks often have no sprint/quarter of their own. Inherit those from the
 * parent before filters run so Developer View stays complete.
 */
function inheritParentContext(items: any[]): any[] {
  const byKey = new Map(items.map((i) => [i.key, i]));
  return items.map((i) => {
    if (!/^sub-?task$/i.test(i.workType) || !i.parentKey) return i;
    const parent = byKey.get(i.parentKey);
    if (!parent) return i;
    return {
      ...i,
      sprints: i.sprints && i.sprints.length > 0 ? i.sprints : parent.sprints,
      quarter: !i.sprints?.length || !i.quarter || i.quarter === "All" ? parent.quarter : i.quarter,
      podName: i.podName && i.podName !== i.team ? i.podName : parent.podName,
      team: i.team || parent.team,
    };
  });
}

/**
 * Sprint ordering metadata for the raw feed (name -> dates). The Jira sprint
 * field objects carry state/start/end when present; names alone still sort
 * via the metricsEngine regex keys.
 */
/** Refresh unique sprint IDs, including closed sprints, once per feed fetch. */
async function refreshSprintDetails(
  issues: Record<string, unknown>[],
  sprintField: string,
  fetchSprint: (id: string) => Promise<Record<string, unknown> | null>,
): Promise<void> {
  const references = new Map<string, Record<string, unknown>[]>();
  for (const issue of issues) {
    const fields = issue.fields as Record<string, unknown> | undefined;
    const sprints = fields?.[sprintField];
    if (!Array.isArray(sprints)) continue;
    for (const value of sprints) {
      if (!value || typeof value !== "object") continue;
      const sprint = value as Record<string, unknown>;
      const id = String(sprint.id ?? "");
      if (!/^\d+$/.test(id)) continue;
      references.set(id, [...(references.get(id) || []), sprint]);
    }
  }
  let failures = 0;
  const ids = [...references.keys()];
  for (let offset = 0; offset < ids.length; offset += 8) {
    await Promise.all(ids.slice(offset, offset + 8).map(async (id) => {
      try {
        const detail = await fetchSprint(id);
        if (!detail || typeof detail.name !== "string") { failures++; return; }
        for (const sprint of references.get(id) || []) Object.assign(sprint, detail);
      } catch { failures++; }
    }));
  }
  if (failures) console.warn("[SPRINT_FETCH] Keeping issue-field metadata for unreadable sprints", {
    failed: failures, total: ids.length,
  });
}

function collectSprintMeta(
  issues: any[],
  sprintField: string = "customfield_10020"
): Record<string, any> {
  const meta: Record<string, any> = {};
  for (const issue of issues) {
    const sprintObj = issue.fields?.[sprintField];
    if (!Array.isArray(sprintObj)) continue;
    for (const s of sprintObj) {
      if (s && typeof s.name === "string" && !meta[s.name]) {
        meta[s.name] = {
          name: s.name,
          id: s.id,
          originBoardId: s.originBoardId,
          state: s.state,
          startDate: s.startDate,
          endDate: s.endDate,
        };
      }
    }
  }
  return meta;
}

/**
 * Calculate simple KPIs from work items.
 */
/**
 * QA Team Capacity & Workload (phase 1) - mirrors src/lib/jira/metricsEngine
 * (Zephyr Essential test cases are ordinary Jira Test-type issues, so Jira
 * issue data alone carries both hours and test-case counts).
 */

/**
 * QA Team Capacity & Workload (phase 1) - mirrors src/lib/jira/metricsEngine.
 * Zephyr Essential test cases are ordinary Jira Test-type issues, so issue
 * data alone carries both hours and test-case counts. Members come from the
 * configured name list plus anyone assigned a Test issue in scope.
 */
const hrsFromSeconds = (seconds: number) =>
  Math.round(((Number(seconds) || 0) / 3600) * 10) / 10;

function buildQaCapacity(items: any[]): any {
  const config = resolveFeedConfig();
  const capacityPerMember =
    Math.round(config.qaCapacityHoursPerWeek * 10) / 10;
  const testTypes = new Set(config.qaTestIssueTypes.map((t) => t.toLowerCase()));
  const supportTypes = new Set(
    config.qaSupportIssueTypes.map((t) => t.toLowerCase())
  );

  const byName = new Map<
    string,
    {
      name: string;
      aliasNames: string[];
      podKeys: string[];
      podNames: string[];
      assigned: number;
      allocatedSeconds: number;
      completedSeconds: number;
      supportedSeconds: number;
      testCases: number;
      openTestCases: number;
      issuesByPod: Record<string, number>;
      allocByPod: Record<string, number>;
      supportByPod: Record<string, number>;
      testsByPod: Record<string, number>;
      openTestsByPod: Record<string, number>;
    }
  >();

  // Roster seed + tolerant matching, mirroring metricsEngine: dots/spaces
  // differences between the configured list and Jira displayNames are ignored.
  const norm = (n: string) => n.toLowerCase().replace(/[\s.]|-/g, "");
  const normMembers = config.qaMembers.map(norm);
  config.qaMembers.forEach((name: string) =>
    byName.set(name, {
      name,
      aliasNames: [],
      podKeys: [],
      podNames: [],
      assigned: 0,
      allocatedSeconds: 0,
      completedSeconds: 0,
      supportedSeconds: 0,
      testCases: 0,
      openTestCases: 0,
      issuesByPod: {},
      allocByPod: {},
      supportByPod: {},
      testsByPod: {},
      openTestsByPod: {},
    })
  );

  const track = (assignee: string) => {
    const idx = normMembers.indexOf(norm(assignee));
    const key = idx !== -1 ? config.qaMembers[idx] : assignee;
    const existing = byName.get(key);
    const entry = existing ?? {
      name: key,
      aliasNames: [],
      podKeys: [] as string[],
      podNames: [] as string[],
      assigned: 0,
      allocatedSeconds: 0,
      completedSeconds: 0,
      supportedSeconds: 0,
      testCases: 0,
      openTestCases: 0,
      issuesByPod: {} as Record<string, number>,
      allocByPod: {} as Record<string, number>,
      supportByPod: {} as Record<string, number>,
      testsByPod: {} as Record<string, number>,
      openTestsByPod: {} as Record<string, number>,
    };
    if (!existing) byName.set(key, entry);
    return entry;
  };

  for (const item of items) {
    const assignee = String(item.assignee || "Unassigned");
    if (!assignee || assignee === "Unassigned") continue; // never a roster row
    const workType = String(item.workType || "").toLowerCase();
    const isTest = testTypes.has(workType);
    const isSupport = supportTypes.has(workType);
    const podKey = item.podKey || "UNPOD";

    const pushPod = (m: Record<string, number>, d: number) => {
      m[podKey] = (m[podKey] || 0) + d;
    };
    if (isTest) {
      // Auto-detect roster: Test issue assignment qualifies a member.
    } else if (normMembers.length > 0) {
      if (!normMembers.includes(norm(assignee))) continue;
    } else {
      continue;
    }

    const entry = track(assignee);
    if (!entry.aliasNames.includes(assignee)) entry.aliasNames.push(assignee);
    if (!entry.podKeys.includes(item.podKey)) entry.podKeys.push(item.podKey);
    if (!entry.podNames.includes(item.podName)) entry.podNames.push(item.podName);
    entry.assigned += 1;
    pushPod(entry.issuesByPod, 1);
    const seconds = item.originalEstimateSeconds || 0;
    if (isTest) {
      entry.testCases += 1;
      pushPod(entry.testsByPod, 1);
    }
    if (isDoneStatus(item.status) || isSubtaskDoneStatus(item.status)) {
      entry.completedSeconds += seconds;
      continue;
    }
    if (isSupport) {
      entry.supportedSeconds += seconds;
      pushPod(entry.supportByPod, seconds / 3600);
    } else {
      entry.allocatedSeconds += seconds;
      pushPod(entry.allocByPod, seconds / 3600);
    }
    if (isTest) {
      entry.openTestCases += 1;
      pushPod(entry.openTestsByPod, 1);
    }
  }

  const roundHrs = (n: number) => Math.round(n * 10) / 10;
  const members = Array.from(byName.values())
    .map((entry) => {
      const allocatedHours = roundHrs(hrsFromSeconds(entry.allocatedSeconds));
      const supportedHours = roundHrs(hrsFromSeconds(entry.supportedSeconds));
      const load = roundHrs(allocatedHours + supportedHours);
      const availableHours = roundHrs(Math.max(0, capacityPerMember - load));
      return {
        name: entry.name,
        aliasNames: entry.aliasNames,
        podKeys: entry.podKeys,
        podNames: entry.podNames,
        assignedIssues: entry.assigned,
        allocatedHours,
        completedHours: roundHrs(hrsFromSeconds(entry.completedSeconds)),
        supportedHours,
        availableHours,
        testCases: entry.testCases,
        openTestCases: entry.openTestCases,
        hoursByPod: Object.fromEntries(
          Object.entries(entry.allocByPod).map(([k, sec]) => [
            k,
            roundHrs(sec + (entry.supportByPod[k] || 0)),
          ])
        ),
        supportByPod: Object.fromEntries(
          Object.entries(entry.supportByPod).map(([k, sec]) => [k, roundHrs(sec)])
        ),
        testsByPod: entry.testsByPod,
        openTestsByPod: entry.openTestsByPod,
        issuesByPod: entry.issuesByPod,
        capacityHours: capacityPerMember,
        utilisationPct:
          capacityPerMember > 0
            ? Math.min(200, Math.round((load / capacityPerMember) * 100))
            : 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const sum = (field: "allocatedHours" | "supportedHours" | "availableHours") =>
    roundHrs(members.reduce((acc, m) => acc + (m[field] as number), 0));

  return {
    members,
    totalCapacityHours: roundHrs(members.length * capacityPerMember),
    allocatedHours: sum("allocatedHours"),
    supportedHours: sum("supportedHours"),
    availableHours: sum("availableHours"),
    testCasesTotal: members.reduce((acc, m) => acc + m.testCases, 0),
  };
}


/** Mirror of the frontend's ZephyrData shape (forge keeps its own copy). */
interface ZephyrData {
  available: boolean;
  message?: string;
  failure?: { api: string; statusCode: number | null; message: string };
  testCasesTotal?: number;
  testExecutionsTotal?: number;
  cases?: any[];
  metricsByAlias?: Record<
    string,
    { pass: number; fail: number; wip: number; blocked: number; unexecuted: number; total: number }
  >;
}

interface ZephyrApiResourceLink {
  id: number;
  self?: string;
}
interface ZephyrApiUserLink {
  accountId: string | null;
  self?: string;
}
interface ZephyrApiIssueLink {
  issueId: number;
  id?: number;
  self?: string;
  target?: string;
  type?: "COVERAGE" | "BLOCKS" | "RELATED";
}
/** Fields consumed from the Zephyr Cloud v2 TestCase API response. */
interface ZephyrApiTestCase {
  id: number;
  key: string;
  name: string;
  project: ZephyrApiResourceLink;
  status: ZephyrApiResourceLink;
  priority: ZephyrApiResourceLink;
  folder?: ZephyrApiResourceLink | null;
  owner?: ZephyrApiUserLink | null;
  labels?: string[];
  createdOn?: string;
  objective?: string | null;
  precondition?: string | null;
  links?: { self?: string; issues?: ZephyrApiIssueLink[] };
}
interface ZephyrCaseRow extends ZephyrApiTestCase {
  __projectKey: string;
  createdDate?: string;
  sprints?: string[];
}
interface ZephyrApiTestExecution {
  id: number;
  key?: string;
  project: ZephyrApiResourceLink;
  testCase: { id?: number; self?: string };
  testExecutionStatus: ZephyrApiResourceLink;
  testCycle?: ZephyrApiResourceLink | null;
  actualEndDate?: string;
  executedById?: string | null;
  assignedToId?: string | null;
}
interface ZephyrCompatibleTestExecution extends ZephyrApiTestExecution {
  testCaseId?: number;
  assignee?: ZephyrApiUserLink | string | null;
  assignedTo?: ZephyrApiUserLink | string | null;
  executedBy?: ZephyrApiUserLink | string | null;
  executor?: ZephyrApiUserLink | string | null;
}
interface ZephyrApiPage<T> {
  startAt: number;
  maxResults: number;
  values?: T[];
  total?: number;
  isLast?: boolean;
  next?: string | null;
}
interface ZephyrEndpointRows {
  testcases: ZephyrApiTestCase;
  testexecutions: ZephyrCompatibleTestExecution;
}
interface ZephyrProjectData {
  key: string;
  cases: ZephyrApiTestCase[];
  executions: ZephyrCompatibleTestExecution[];
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}


function qaPoolFromItems(items: any[]): any[] {
  return items.filter((i: any) => !/^sub-?task$/i.test(String(i.workType || "")));
}

/** Zephyr Essential Cloud v2.9 uses the API access token created in the Zephyr UI. */
async function fetchZephyrExecutions(
  pool: any[],
  config: { storyPointsField: string; sprintField: string; podField: string; ahaUrlField?: string }
): Promise<ZephyrData> {
  const token = (process.env.JIRA_ZEPHYR_API_TOKEN?.trim() || "").replace(
    /^Bearer\s+/i,
    "",
  );
  const projects = (process.env.JIRA_ZEPHYR_PROJECT_KEYS || "")
    .split(",").map((x) => x.trim()).filter(Boolean);
  if (!token || !projects.length) {
    console.info("[ZEPHYR_FETCH] Skipped: configuration is incomplete", {
      tokenConfigured: Boolean(token),
      projectCount: projects.length,
    });
    return { available: false, message: "Configure JIRA_ZEPHYR_API_TOKEN and JIRA_ZEPHYR_PROJECT_KEYS in Forge variables" };
  }
  const startedAt = Date.now();
  console.info("[ZEPHYR_FETCH] Forge request started", {
    tokenConfigured: Boolean(token),
    projectKeys: projects,
    authorizationScheme: "Bearer",
  });
  const base = "https://prod-api.zephyr4jiracloud.com/v2";
  const allowedZephyrHosts = new Set([
    "prod-api.zephyr4jiracloud.com",
    "prod-play.zephyr4jiracloud.com",
  ]);
  const normalizeZephyrUrl = (url: URL): URL => {
    if (url.protocol !== "https:" || !allowedZephyrHosts.has(url.hostname)) {
      throw new Error("Zephyr returned an unexpected API URL");
    }
    // Some Zephyr responses return Connect-prefixed links even though the
    // Cloud v2 API is served from /v2.
    url.pathname = url.pathname.replace(/^\/connect\/v2(?=\/|$)/, "/v2");
    return url;
  };
  const allPages = async <E extends keyof ZephyrEndpointRows>(endpoint: E, projectKey: string, signal?: AbortSignal) => {
    const firstUrl = new URL(`${base}/${endpoint}`);
    firstUrl.search = new URLSearchParams({ projectKey, startAt: "0", maxResults: "100" }).toString();
    let url: URL | null = firstUrl;
    let startAt = 0;
    let total: number | undefined;
    const values: ZephyrEndpointRows[E][] = [];
    let pageCount = 0;
    while (url && pageCount++ < 1000) {
      url = normalizeZephyrUrl(url);
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal,
      });
      if (!response.ok) {
        const contentType = response.headers.get("content-type") || "unknown";
        const wwwAuthenticate = response.headers.get("www-authenticate") || undefined;
        const rawBody = await response.text();
        let responseMessage: string | undefined;
        try {
          const body = JSON.parse(rawBody) as Record<string, unknown>;
          const candidate = body.message ?? body.error_description ?? body.error ?? body.title;
          if (typeof candidate === "string") responseMessage = candidate.slice(0, 240);
        } catch {
          // Zephyr's gateway may return a plain-text rejection instead of JSON.
          // Log only a short, sanitized excerpt to help diagnose those failures.
          if (contentType.toLowerCase().startsWith("text/plain")) {
            responseMessage = rawBody
              .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "[REDACTED_TOKEN]")
              .replace(/[\r\n\t]+/g, " ")
              .trim()
              .slice(0, 240);
          }
        }
        console.error("[ZEPHYR_FETCH] Zephyr API request rejected", {
          endpoint: url.pathname,
          projectKey,
          statusCode: response.status,
          contentType,
          wwwAuthenticate,
          responseMessage,
          tokenConfigured: Boolean(token),
          authorizationScheme: "Bearer",
        });
        const detail = responseMessage ? `: ${responseMessage}` : "";
        throw new Error(`Zephyr Essential API GET ${url.pathname} for project ${projectKey} returned ${response.status}${detail}`);
      }
      const page = await response.json() as ZephyrApiPage<ZephyrEndpointRows[E]>;
      const rows = page.values ?? [];
      if (total === undefined) total = page.total;
      values.push(...rows);
      startAt += rows.length;
      if (page.isLast === true || !rows.length) {
        url = null;
      } else if (page.next) {
        url = normalizeZephyrUrl(new URL(page.next, url));
      } else if (page.isLast === false || rows.length >= (page.maxResults ?? 100)) {
        const fallback = new URL(firstUrl);
        fallback.searchParams.set("startAt", String(startAt));
        url = fallback;
      } else {
        url = null;
      }
    }
    if (url) throw new Error(`Zephyr Essential API pagination exceeded the safety limit for ${endpoint}`);
    return { values, total };
  };
  try {
    const metricsByAlias: NonNullable<ZephyrData["metricsByAlias"]> = {};
    const projectErrors: string[] = [];
    const projectResults = await mapWithConcurrency(projects, 8, async (project) => {
      let cases: ZephyrApiTestCase[] | null = null;
      let executions: ZephyrCompatibleTestExecution[] = [];
      const controller = new AbortController();
      const projectTimer = setTimeout(() => controller.abort(), 12_000);
      try {
        const [caseResult, executionResult] = await Promise.allSettled([
          allPages("testcases", project, controller.signal),
          allPages("testexecutions", project, controller.signal),
        ]);
        if (caseResult.status === "fulfilled") cases = caseResult.value.values;
        else projectErrors.push(`${project} test cases: ${caseResult.reason instanceof Error ? caseResult.reason.message : "request failed"}`);
        if (executionResult.status === "fulfilled") executions = executionResult.value.values;
        else projectErrors.push(`${project} executions: ${executionResult.reason instanceof Error ? executionResult.reason.message : "request failed"}`);
      } catch (error) {
        projectErrors.push(`${project}: ${error instanceof Error ? error.message : "request failed"}`);
      } finally {
        clearTimeout(projectTimer);
      }
      return cases ? { key: project, cases, executions } satisfies ZephyrProjectData : null;
    });
    const projectData = projectResults.filter((project): project is ZephyrProjectData => project !== null);
    if (!projectData.length) {
      const message = projectErrors.join("; ") || "No Zephyr projects could be read";
      const statusCode = message.match(/(?:returned|failed:|rate limited)\s*(\d{3})\b/i)?.[1];
      const failure = { api: "Zephyr Essentials API", statusCode: statusCode ? Number(statusCode) : null, message };
      console.error("[ZEPHYR_FETCH] Forge request failed", failure);
      return { available: false, message, failure };
    }
    const record = (value: unknown): Record<string, any> => value && typeof value === "object" ? value as Record<string, any> : {};
    const get = (value: unknown, ...keys: string[]) => { const object = record(value); for (const key of keys) if (object[key] != null) return object[key]; return undefined; };
    const person = (value: unknown) => typeof value === "string" ? value : String(get(value, "displayName", "name", "fullName", "username") || "");
    const personId = (value: unknown) => String(get(value, "accountId", "accountID", "userKey") || "");
    const referenceCache = new Map<string, Promise<string>>();
    const referenceName = async (value: unknown, fallback: string) => {
      const inline = get(value, "name", "value", "displayName", "statusName");
      if (inline) return String(inline);
      const self = String(get(value, "self") || "");
      if (!self) return fallback;
      if (!referenceCache.has(self)) referenceCache.set(self, (async () => {
        try {
          const url = new URL(self);
          normalizeZephyrUrl(url);
          const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(8_000) });
          if (!response.ok) return fallback;
          const body = await response.json();
          return String(get(body, "name", "value", "displayName", "statusName") || fallback);
        } catch { return fallback; }
      })());
      return referenceCache.get(self)!;
    };
    const projectNames: Record<string, string> = {};
    await Promise.all(projects.map(async (key) => {
      try { const response = await api.asApp().requestJira(route`/rest/api/3/project/${key}`); if (response.ok) { const project = await response.json() as { name?: string }; if (project.name) projectNames[key] = project.name; } } catch { /* use project key fallback */ }
    }));
    const caseRows: ZephyrCaseRow[] = projectData.flatMap(({ key, cases }) => cases.map((testCase) => ({ ...testCase, __projectKey: key })));
    // Zephyr's case list can return an empty inline issue list while its
    // Traceability view still has Coverage links. Follow each case's published
    // links.self resource to retrieve those Jira work-item links.
    const traceabilityIssues = new Map<string, unknown[]>();
    const traceabilityTargets = caseRows.flatMap((testCase) => {
      const links = record(testCase.links);
      const embedded = Array.isArray(links.issues) ? links.issues : [];
      const self = String(get(links, "self") || "");
      const rowKey = `${testCase.__projectKey}:${testCase.key}`;
      if (embedded.length) {
        traceabilityIssues.set(rowKey, embedded);
        return [];
      }
      if (!self) return [];
      try {
        const url = new URL(self);
        if (!/^\/(?:connect\/)?v2\/testcases\/[^/]+\/links\/?$/.test(url.pathname)) return [];
        normalizeZephyrUrl(url);
        return [{ rowKey, url }];
      } catch {
        return [];
      }
    });
    let traceabilityFailures = 0;
    await mapWithConcurrency(traceabilityTargets, 32, async ({ rowKey, url }) => {
        try {
          const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(8_000) });
          if (!response.ok) { traceabilityFailures++; return; }
          const body = record(await response.json());
          traceabilityIssues.set(rowKey, Array.isArray(body.issues) ? body.issues : []);
        } catch {
          traceabilityFailures++;
        }
      });
    if (traceabilityFailures) projectErrors.push(`Zephyr Traceability links unavailable for ${traceabilityFailures} of ${traceabilityTargets.length} cases`);
    const idToKey = new Map(caseRows.map((testCase) => [String(testCase.id || ""), String(testCase.key || "")]));
    const users = new Set<string>();
    for (const testCase of caseRows) { const id = personId(testCase.owner); if (id) users.add(id); }
    for (const { executions } of projectData) for (const execution of executions) for (const actor of [execution.assignee, execution.assignedTo, execution.executedBy, execution.executor]) { const id = personId(actor); if (id) users.add(id); }
    const names: Record<string, string> = {};
    await mapWithConcurrency(Array.from(users), 16, async (id) => {
      try { const response = await api.asApp().requestJira(route`/rest/api/3/user?accountId=${id}`); if (response.ok) { const user = await response.json() as { displayName?: string }; if (user.displayName) names[id] = user.displayName; } } catch { /* account ID is the visible fallback */ }
    });
    const executionMap = new Map<string, any[]>();
    const allExecutions = projectData.flatMap(({ executions }) => executions);
    for (const execution of allExecutions) {
      const testRef = get(execution, "testCase", "testcase", "test");
      const testKey = String(get(execution, "testCaseKey", "testcaseKey", "issueKey") || (typeof testRef === "string" ? testRef : "") || get(testRef, "key") || idToKey.get(String(get(testRef, "id") || execution.testCaseId || "")) || "");
      if (!testKey) continue;
      const rawStatus = get(execution, "testExecutionStatus", "executionStatus", "status");
      const statusId = String(get(rawStatus, "id") || "");
      const status = await referenceName(rawStatus, statusId ? `Status ${statusId}` : "Not executed");
      const normalized = status.toLowerCase();
      const statusCategory = /pass|success/.test(normalized) ? "passed" : /fail/.test(normalized) ? "failed" : /block/.test(normalized) ? "blocked" : /progress|wip|running|executing/.test(normalized) ? "in-progress" : /not executed|unexecuted|not started|pending|to do/.test(normalized) ? "pending" : "other";
      const assignee = get(execution, "assignedTo", "assignee", "assignedTester");
      const executor = get(execution, "executedBy", "executor", "executedByUser");
      const detail = { id: String(get(execution, "id", "executionId", "key") || `${testKey}-${(executionMap.get(testKey) || []).length}`), status, statusCategory, assignedTo: person(assignee) || names[personId(assignee)] || personId(assignee) || "Unassigned", executedBy: person(executor) || names[personId(executor)] || personId(executor) || "Unrecorded", executedOn: get(execution, "executedOn", "actualEndDate", "updatedOn", "createdOn"), cycle: String(get(get(execution, "testCycle", "cycle"), "name", "key") || get(execution, "cycleName", "testCycleName") || "") };
      executionMap.set(testKey, [...(executionMap.get(testKey) || []), detail]);
      const owner = detail.executedBy !== "Unrecorded" ? detail.executedBy : detail.assignedTo;
      if (owner !== "Unrecorded" && owner !== "Unassigned") {
        const norm = (name: string) => name.toLowerCase().replace(/[\s._-]/g, "");
        const bucket = metricsByAlias[norm(owner)] ||= { pass: 0, fail: 0, wip: 0, blocked: 0, unexecuted: 0, total: 0 };
        bucket.total++; if (statusCategory === "passed") bucket.pass++; else if (statusCategory === "failed") bucket.fail++; else if (statusCategory === "blocked") bucket.blocked++; else if (statusCategory === "in-progress") bucket.wip++; else bucket.unexecuted++;
      }
    }
    let cases = await Promise.all(caseRows.map(async (testCase) => {
      const projectKey = String(testCase.__projectKey || String(testCase.key || "").split("-T")[0] || "UNKNOWN");
      const issueLinks = traceabilityIssues.get(`${testCase.__projectKey}:${testCase.key}`) ?? [];
      const linkedIssueKeys = issueLinks.map((issue: any) => {
        if (typeof issue === "string") return String(issue.match(/(?:browse|issue)\/([A-Z][A-Z0-9_]+-\d+)/i)?.[1] || issue);
        const target = String(issue?.key || issue?.issueKey || issue?.target || issue?.self || "");
        return String(target.match(/(?:browse|issue)\/([A-Z][A-Z0-9_]+-\d+)/i)?.[1] || target.match(/[A-Z][A-Z0-9_]+-\d+/i)?.[0] || target);
      }).filter((key: string) => /^[A-Z][A-Z0-9_]*-\d+$/i.test(key));
      const linkedIssueIds = issueLinks.map((issue: any) => typeof issue === "string" ? String(issue.match(/\/issue\/(\d+)/i)?.[1] || "") : String(issue?.issueId || issue?.self?.match?.(/\/issue\/(\d+)/i)?.[1] || "")).filter((id: string) => /^\d+$/.test(id));
      const linkedPods = new Map<string, string>();
      const linkedSprints = new Set<string>();
      for (const key of linkedIssueKeys) {
        const issue = pool.find((item) => item.key === key);
        if (issue) {
          linkedPods.set(issue.podKey || issue.projectKey, issue.podName || issue.projectName || issue.podKey);
          for (const sprint of issue.sprints || []) if (sprint) linkedSprints.add(sprint);
        }
      }
      const projectPods = new Map<string, string>();
      for (const item of pool.filter((entry) => entry.projectKey === projectKey && entry.podKey)) projectPods.set(item.podKey, item.podName || item.podKey);
      const podSource = linkedPods.size ? "linked Jira issue" : projectPods.size === 1 ? "project mapping" : "project fallback";
      const pods = linkedPods.size ? linkedPods : projectPods.size === 1 ? projectPods : new Map([[projectKey, projectKey]]);
      const ownerAccountId = personId(testCase.owner);
      const ownerName = person(testCase.owner) || names[ownerAccountId] || ownerAccountId || "Unassigned";
      const executions = (executionMap.get(String(testCase.key || "")) || []).sort((a, b) => Date.parse(b.executedOn || "") - Date.parse(a.executedOn || ""));
      const label = async (value: unknown, fallback: string) => referenceName(value, get(value, "id") ? `Status ${get(value, "id")}` : fallback);
      return { id: String(testCase.id || testCase.key), key: String(testCase.key || ""), name: String(testCase.name || testCase.key || ""), projectKey, projectName: projectNames[projectKey] || pool.find((item) => item.projectKey === projectKey)?.projectName || projectKey, podKeys: Array.from(pods.keys()), podNames: Array.from(pods.values()), podSource, ownerName, ownerAccountId: ownerAccountId || undefined, status: await label(testCase.status, "Unknown"), priority: await label(testCase.priority, "Unspecified"), folder: await label(testCase.folder, "Unfiled"), labels: Array.isArray(testCase.labels) ? testCase.labels.map(String) : [], linkedIssueKeys, linkedIssueIds, sprints: Array.from(linkedSprints).sort((a, b) => a.localeCompare(b)), createdOn: testCase.createdOn || testCase.createdDate, objective: testCase.objective, precondition: testCase.precondition, executionCount: executions.length, latestExecution: executions[0], executions };
    }));
    const jiraFields = ["summary", "status", "issuetype", "project", config.sprintField, config.podField, config.storyPointsField];
    const linkedIdItems = new Map<string, any>();
    const linkedIds = Array.from(new Set(cases.flatMap((testCase) => testCase.linkedIssueIds ?? [])));
    await mapWithConcurrency(linkedIds, 16, async (id) => {
        try {
          const issue = await jiraClient.getIssue(id, jiraFields);
          linkedIdItems.set(id, mapIssueToWorkItem(issue, config));
        } catch {
          // Keep the linked issue key/ID available when Jira cannot enrich it.
        }
      });
    const sprintLookupKeys = Array.from(new Set(cases.flatMap((testCase) => [
      testCase.key,
      ...testCase.linkedIssueKeys,
      ...(testCase.linkedIssueIds ?? []).map((id) => linkedIdItems.get(id)?.key || ""),
    ])))
      .filter((key) => /^[A-Z][A-Z0-9_]*-\d+$/i.test(key));
    try {
      const sprintItems: any[] = Array.from(linkedIdItems.values());
      const sprintChunks = Array.from({ length: Math.ceil(sprintLookupKeys.length / 80) }, (_, index) => sprintLookupKeys.slice(index * 80, (index + 1) * 80));
      const sprintResults = await mapWithConcurrency(sprintChunks, 4, async (chunk) =>
        chunk.length ? jiraClient.searchIssuesJql(`key in (${chunk.join(", ")})`, jiraFields) : []
      );
      sprintItems.push(...sprintResults.flat());
      const byKey = new Map(sprintItems.map((issue) => {
        const item = mapIssueToWorkItem(issue, config);
        return [item.key, item] as const;
      }));
      cases = cases.map((testCase) => {
        const resolvedKeys = (testCase.linkedIssueIds ?? []).map((id) => linkedIdItems.get(id)?.key || "").filter(Boolean);
        const linkedIssueKeys = Array.from(new Set([...testCase.linkedIssueKeys, ...resolvedKeys]));
        const linkedItems = linkedIssueKeys.map((key) => byKey.get(key)).filter(Boolean);
        const linkedSprints = linkedItems.flatMap((item) => item.sprints || []);
        const caseSprints = byKey.get(testCase.key)?.sprints || [];
        const originalSprints = testCase.sprints || [];
        const linkedPods = new Map(linkedItems.map((item) => [item.podKey || item.projectKey, item.podName || item.projectName || item.podKey]));
        return { ...testCase, linkedIssueKeys, ...(linkedPods.size ? { podKeys: Array.from(linkedPods.keys()), podNames: Array.from(linkedPods.values()), podSource: "linked Jira issue" } : {}), sprints: Array.from(new Set(linkedSprints.length ? linkedSprints : caseSprints.length ? caseSprints : originalSprints)) };
      });
      if (cases.length && !cases.some((testCase) => testCase.sprints.length)) {
        projectErrors.push("No Jira sprint values found for Zephyr test-case or linked issue keys; verify Jira issue visibility and sprint assignment");
      }
    } catch (error) {
      projectErrors.push(`Jira sprint lookup: ${error instanceof Error ? error.message : "request failed"}`);
    }
    const projectErrorMessage = projectErrors.join("; ");
    const statusCode = projectErrorMessage.match(/(?:returned|failed:|rate limited)\s*(\d{3})\b/i)?.[1];
    const failure = projectErrors.length ? {
      api: /Jira sprint lookup:/i.test(projectErrorMessage) ? "Jira API" : "Zephyr Essentials API",
      statusCode: statusCode ? Number(statusCode) : null,
      message: projectErrorMessage,
    } : undefined;
    console.info("[ZEPHYR_FETCH] Forge request completed", {
      projectCount: projectData.length,
      caseCount: cases.length,
      executionCount: cases.reduce((total, testCase) => total + testCase.executionCount, 0),
      partialFailureCount: projectErrors.length,
      durationMs: Date.now() - startedAt,
    });
    return {
      available: true,
      cases,
      metricsByAlias,
      testCasesTotal: cases.length,
      testExecutionsTotal: cases.reduce((total, testCase) => total + testCase.executionCount, 0),
      ...(projectErrors.length ? { message: `Partial Zephyr data: ${projectErrors.join("; ")}` } : {}),
      ...(failure ? { failure } : {}),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Zephyr Cloud unavailable";
    const statusCode = message.match(/(?:returned|failed:|rate limited)\s*(\d{3})\b/i)?.[1];
    const failure = { api: "Zephyr Essentials API", statusCode: statusCode ? Number(statusCode) : null, message };
    console.error("[ZEPHYR_FETCH] Forge request failed", failure);
    return { available: false, message, failure };
  }
}

function calculateKPIs(
  items: any[],
  filters: any,
  developerSource: any[] = items,
  forecastSource: any[] = items,
  forecastChildSource: any[] = forecastSource,
  sprintMeta: Record<string, any> = {}
) {
  const totalIssues = items.length;
  const totalStoryPoints = items.reduce(
    (sum, i) => sum + (i.storyPoints || 0),
    0
  );
  const completedIssues = items.filter((i) => isDoneStatus(i.status)).length;
  const completedStoryPoints = items
    .filter((i) => isDoneStatus(i.status))
    .reduce((sum, i) => sum + (i.storyPoints || 0), 0);

  const sayDo = totalStoryPoints > 0 ? completedStoryPoints / totalStoryPoints : 0;
  const carryover =
    totalStoryPoints > 0 ? (totalStoryPoints - completedStoryPoints) / totalStoryPoints : 0;

  // Group by pod
  const podMap = new Map<string, { count: number; sp: number; doneSp: number }>();
  for (const item of items) {
    const pod = item.podKey || "Unknown";
    if (!podMap.has(pod)) {
      podMap.set(pod, { count: 0, sp: 0, doneSp: 0 });
    }
    const p = podMap.get(pod)!;
    p.count++;
    p.sp += item.storyPoints || 0;
    if (isDoneStatus(item.status)) {
      p.doneSp += item.storyPoints || 0;
    }
  }

  const pods = Array.from(podMap.entries()).map(([key, val]) => ({
    id: key,
    name: key,
    issueCount: val.count,
    storyPoints: val.sp,
    completedStoryPoints: val.doneSp,
  }));

  // Group by sprint (real committed/done SP and issue counts)
  const sprintMap = new Map<
    string,
    { count: number; sp: number; doneSp: number; carriedSp: number; doneCount: number }
  >();
  const completionSprintCache = new Map<string, string | null>();
  const carryoverCheckAt = Date.now();
  const completionSprintFor = (item: any): string | null => {
    if (!isDoneStatus(item.status)) return null;
    if (completionSprintCache.has(item.key)) return completionSprintCache.get(item.key) ?? null;
    const attachedSprints: string[] = Array.isArray(item.sprints) ? item.sprints : [];
    if (!attachedSprints.length) {
      completionSprintCache.set(item.key, null);
      return null;
    }
    const resolvedAt = Date.parse(item.resolutionDate || "");
    if (!Number.isNaN(resolvedAt)) {
      const sprintDates = attachedSprints.map((name) => {
        const meta = sprintMeta[name];
        const start = meta?.startDate ? Date.parse(meta.startDate) : Number.NaN;
        let end = meta?.endDate ? Date.parse(meta.endDate) : Number.NaN;
        if (meta?.endDate && /^\d{4}-\d{2}-\d{2}$/.test(meta.endDate) && !Number.isNaN(end)) end += 86_400_000 - 1;
        return { name, start, end };
      }).filter((sprint) => !Number.isNaN(sprint.start) || !Number.isNaN(sprint.end));
      const containsResolution = sprintDates.filter((sprint) =>
        (Number.isNaN(sprint.start) || resolvedAt >= sprint.start) &&
        (Number.isNaN(sprint.end) || resolvedAt <= sprint.end)
      ).sort((a, b) => (Number.isNaN(b.start) ? -Infinity : b.start) - (Number.isNaN(a.start) ? -Infinity : a.start));
      if (containsResolution.length) {
        completionSprintCache.set(item.key, containsResolution[0].name);
        return containsResolution[0].name;
      }
      const startedBeforeResolution = sprintDates.filter((sprint) => !Number.isNaN(sprint.start) && sprint.start <= resolvedAt)
        .sort((a, b) => b.start - a.start);
      if (startedBeforeResolution.length) {
        completionSprintCache.set(item.key, startedBeforeResolution[0].name);
        return startedBeforeResolution[0].name;
      }
      if (sprintDates.length) {
        sprintDates.sort((a, b) => (Number.isNaN(a.start) ? Infinity : a.start) - (Number.isNaN(b.start) ? Infinity : b.start));
        completionSprintCache.set(item.key, sprintDates[0].name);
        return sprintDates[0].name;
      }
    }
    const fallback = attachedSprints[attachedSprints.length - 1];
    completionSprintCache.set(item.key, fallback);
    return fallback;
  };
  const isLaterSprintForItem = (item: any, candidate: string, source: string) => {
    const candidateStart = Date.parse(sprintMeta[candidate]?.startDate || "");
    const sourceStart = Date.parse(sprintMeta[source]?.startDate || "");
    if (Number.isFinite(candidateStart) && Number.isFinite(sourceStart)) {
      return candidateStart > sourceStart;
    }
    return item.sprints.indexOf(candidate) > item.sprints.indexOf(source);
  };
  const isCarryoverFromSprint = (item: any, source: string) => {
    if (!item.sprints.includes(source)) return false;
    const meta = sprintMeta[source];
    let end = Date.parse(meta?.endDate || "");
    if (meta?.endDate && /^\d{4}-\d{2}-\d{2}$/.test(meta.endDate) && Number.isFinite(end)) {
      end += DAY_MS - 1;
    }
    const sourceEnded = String(meta?.state || "").toLowerCase() === "closed" ||
      (Number.isFinite(end) && end <= carryoverCheckAt);
    if (!sourceEnded) return false;
    const movedToLaterSprint = item.sprints.some(
      (sprint: string) => sprint !== source && isLaterSprintForItem(item, sprint, source),
    );
    if (!movedToLaterSprint) return false;
    if (isDoneStatus(item.status)) {
      const completionSprint = completionSprintFor(item);
      return Boolean(
        completionSprint && isLaterSprintForItem(item, completionSprint, source),
      );
    }
    return true;
  };
  for (const item of items) {
    for (const sprint of item.sprints) {
      if (filters.sprintId && filters.sprintId !== "all" && sprint !== filters.sprintId) continue;
      if (!sprintMap.has(sprint)) {
        sprintMap.set(sprint, { count: 0, sp: 0, doneSp: 0, carriedSp: 0, doneCount: 0 });
      }
      const s = sprintMap.get(sprint)!;
      const sp = item.storyPoints || 0;
      s.count++;
      s.sp += sp;
      if (isDoneStatus(item.status) && completionSprintFor(item) === sprint) {
        s.doneSp += sp;
        s.doneCount++;
      }
      if (isCarryoverFromSprint(item, sprint)) s.carriedSp += sp;
    }
  }

  const allSprints = Array.from(sprintMap.entries())
    .filter(([, val]) => val.count > 0)
    .map(([name, val]) => ({
      id: name,
      name,
      issueCount: val.count,
      storyPoints: Math.round(val.sp),
      doneStoryPoints: Math.round(val.doneSp),
      carriedStoryPoints: Math.round(val.carriedSp),
      doneIssueCount: val.doneCount,
    }));

  // Plot only the latest five sprints so the charts stay readable.
  const sprints = allSprints.slice(-5);

  const completedSeries = sprints.map((s) => s.doneStoryPoints);
  const committedSeries = sprints.map((s) => s.storyPoints);
  const lastThree = completedSeries.slice(Math.max(completedSeries.length - 3, 0));
  const avgLastThree = lastThree.length
    ? Number((lastThree.reduce((a, b) => a + b, 0) / lastThree.length).toFixed(1))
    : 0;
  const lastDone = completedSeries[completedSeries.length - 1] || 0;
  const prevDone = completedSeries[completedSeries.length - 2] || 0;
  const trendStatus =
    completedSeries.length < 2
      ? ("stable" as const)
      : lastDone > prevDone
      ? ("rising" as const)
      : lastDone < prevDone
      ? ("falling" as const)
      : ("stable" as const);

  const sprintSayDo = (s?: typeof allSprints[number]) =>
    s && s.storyPoints > 0 ? Math.round((s.doneStoryPoints / s.storyPoints) * 100) : 0;
  const sprintCarry = (s?: typeof allSprints[number]) =>
    s && s.storyPoints > 0
      ? Math.round((s.carriedStoryPoints / s.storyPoints) * 100)
      : 0;

  // Executive KPIs aggregate over the current selection using de-duplicated
  // item totals (an item carried across sprints is counted once).
  const lastSprint = sprints[sprints.length - 1];
  const prevSprint = sprints[sprints.length - 2];

  const totalCommittedSP = totalStoryPoints;
  const totalDoneSP = completedStoryPoints;
  const totalCarriedSP = items
    .filter((item) => item.sprints.some((sprint: string) =>
      sprintMap.has(sprint) && isCarryoverFromSprint(item, sprint)
    ))
    .reduce((sum, item) => sum + (item.storyPoints || 0), 0);
  const isAllSprints = !filters.sprintId || filters.sprintId === "all";
  const scopeCommittedSP = isAllSprints ? totalCommittedSP : lastSprint?.storyPoints ?? 0;
  const scopeDoneSP = isAllSprints ? totalDoneSP : lastSprint?.doneStoryPoints ?? 0;
  const scopeCarriedSP = isAllSprints ? totalCarriedSP : lastSprint?.carriedStoryPoints ?? 0;

  const savedSayDo =
    scopeCommittedSP > 0 ? Math.round((scopeDoneSP / scopeCommittedSP) * 100) : 0;
  const savedCarry =
    scopeCommittedSP > 0 ? Math.round((scopeCarriedSP / scopeCommittedSP) * 100) : 0;
  let currentVelocity = scopeDoneSP;
  let velocityPodCount = 0;

  // Global All Pods / All Quarters / All Sprints: average each pod's sprint
  // velocity first, then average the pods. Other filter combinations keep the
  // existing calculation.
  const isGlobalAll =
    (!filters.podId || filters.podId === "all") &&
    (!filters.quarterId || filters.quarterId === "all") &&
    (!filters.sprintId || filters.sprintId === "all");
  let globalVelocityTrend: number | null = null;
  let velocityCompareCurrent = lastSprint?.doneStoryPoints ?? 0;
  let velocityComparePrevious = prevSprint?.doneStoryPoints ?? 0;
  if (isGlobalAll) {
    // Velocity only counts accepted (done) items with real story points.
    const velocityItems = items.filter(
      (item) => isDoneStatus(item.status) && (item.storyPoints || 0) > 0
    );
    const podPools = new Map<string, any[]>();
    for (const item of velocityItems) {
      const key = item.podKey || "UNKNOWN";
      if (!podPools.has(key)) podPools.set(key, []);
      podPools.get(key)!.push(item);
    }

    const podAverages: number[] = [];
    podPools.forEach((pool) => {
      const podSprints = sprints.filter((s) =>
        pool.some((i) => i.sprints.includes(s.name))
      );
      if (!podSprints.length) return;
      const perSprint = podSprints.map((s) =>
        pool
          .filter((i) => i.sprints.includes(s.name) && isDoneStatus(i.status) && completionSprintFor(i) === s.name)
          .reduce((sum, i) => sum + (i.storyPoints || 0), 0)
      );
      podAverages.push(
        perSprint.reduce((a, b) => a + b, 0) / perSprint.length
      );
    });

    velocityPodCount = podAverages.length;
    currentVelocity = podAverages.length
      ? Math.round(
          podAverages.reduce((a, b) => a + b, 0) / podAverages.length
        )
      : 0;

    if (lastSprint && prevSprint) {
      const podAvgForSprint = (name: string) => {
        const vals: number[] = [];
        podPools.forEach((pool) => {
          if (!pool.some((i) => i.sprints.includes(name))) return;
          vals.push(
            pool
              .filter((i) => i.sprints.includes(name) && isDoneStatus(i.status) && completionSprintFor(i) === name)
              .reduce((sum, i) => sum + (i.storyPoints || 0), 0)
          );
        });
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      };
      const latest = podAvgForSprint(lastSprint.name);
      const previous = podAvgForSprint(prevSprint.name);
      velocityCompareCurrent = latest;
      velocityComparePrevious = previous;
      globalVelocityTrend =
        previous > 0 ? Math.round(((latest - previous) / previous) * 100) : latest > 0 ? 100 : 0;
    }
  }

  const sayDoTrend =
    lastSprint && prevSprint ? sprintSayDo(lastSprint) - sprintSayDo(prevSprint) : 0;
  const carryTrend =
    lastSprint && prevSprint ? sprintCarry(lastSprint) - sprintCarry(prevSprint) : 0;
  const velocityTrendPct =
    globalVelocityTrend !== null
      ? globalVelocityTrend
      : lastSprint && prevSprint
      ? prevSprint.doneStoryPoints > 0
        ? Math.round(
            ((lastSprint.doneStoryPoints - prevSprint.doneStoryPoints) /
              prevSprint.doneStoryPoints) *
              100
          )
        : lastSprint.doneStoryPoints > 0
        ? 100
        : 0
      : 0;

  const trendText = (delta: number, unit: string) =>
    !lastSprint || !prevSprint
      ? "No previous sprint"
      : delta === 0
      ? "No change"
      : `${Math.abs(Math.round(delta))} ${unit}`;
  const sayDoTrendText = trendText(sayDoTrend, "pts");
  const carryTrendText = trendText(
    carryTrend,
    Math.abs(carryTrend) === 1 ? "pt" : "pts"
  );
  const velocityTrendText =
    !lastSprint || !prevSprint
      ? "No previous sprint"
      : velocityCompareCurrent === velocityComparePrevious
      ? "No change"
      : `${Math.abs(Math.round(velocityCompareCurrent - velocityComparePrevious))} SP`;

  // Features often have no quarter/sprint of their own. A feature counts as
  // "planned" in the current scope when it is in scope itself or is an
  // ancestor of an item in the current scope.
  const featureRe = forecastChildSource.some((i: any) =>
    /^feature$/i.test(i.workType)
  )
    ? /^feature$/i
    : /^epic$/i;
  const featureByKey = new Map(forecastChildSource.map((i: any) => [i.key, i]));
  const activeKeys = new Set(items.map((i: any) => i.key));
  const featureKeys = new Set<string>();
  for (const item of items) {
    let cursor: any = item;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor.key)) {
      seen.add(cursor.key);
      if (featureRe.test(cursor.workType)) {
        featureKeys.add(cursor.key);
        break;
      }
      cursor = cursor.parentKey ? featureByKey.get(cursor.parentKey) : undefined;
    }
  }
  const podFeaturePool = forecastChildSource.filter(
    (i: any) =>
      featureRe.test(i.workType) &&
      (activeKeys.has(i.key) || featureKeys.has(i.key))
  );
  const futureForecast = computeFuturePredictability(podFeaturePool, forecastChildSource);
  const futureTrendText =
    futureForecast.forecastableCount > 0
      ? `${futureForecast.onTimeCount} of ${futureForecast.forecastableCount}`
      : futureForecast.plannedCount > 0
      ? "No estimated features"
      : "No planned features";

  // Predictability across the selection: delivered / planned SP.
  const predictabilityScore =
      scopeCommittedSP > 0 ? Math.round((scopeDoneSP / scopeCommittedSP) * 100) : 0;

  const podsWithAll = [
    {
      id: "all",
      key: "ALL",
      name: "All Pods",
      sub: `${pods.length} pods`,
      issueCount: totalIssues,
      storyPoints: totalStoryPoints,
      completedStoryPoints: completedStoryPoints,
    },
    ...pods.map((p) => ({ ...p, key: p.id })),
  ];

  const quarterSet = new Set<string>();
  for (const item of items) {
    if (item.quarter && item.quarter !== "All") quarterSet.add(item.quarter);
  }
  const quarters = [
    { id: "all", name: "All Quarters", sub: "Full Portfolio" },
    ...Array.from(quarterSet)
      .sort()
      .map((q) => ({ id: q, name: q })),
  ];

  // Developer View is Story + Sub-task only. developerSource keeps subtasks,
  // which are excluded from every other metric.
  const estimateHours = (seconds: any) =>
    Math.round(((Number(seconds) || 0) / 3600) * 10) / 10;
  const devItems = developerSource.filter((i: any) =>
    /^(story|sub-?task)$/i.test(i.workType)
  );
  const devMap = new Map<string, any>();
  for (const it of devItems) {
    const name = it.assignee || "Unassigned";
    const stat = devMap.get(name) || {
      name,
      team: it.team || it.podName,
      assigned: 0,
      done: 0,
      stories: 0,
      subtasks: 0,
      completedStories: 0,
      completedSubtasks: 0,
      deliveredSP: 0,
      totalSP: 0,
      originalEstimateSeconds: 0,
      completedEstimateSeconds: 0,
    };
    const isSubtask = /^sub-?task$/i.test(it.workType);
    const done = isSubtask ? isSubtaskDoneStatus(it.status) : isDoneStatus(it.status);
    stat.assigned += 1;
    stat.totalSP += it.storyPoints || 0;
    stat.originalEstimateSeconds += it.originalEstimateSeconds || 0;
    if (isSubtask) stat.subtasks += 1;
    else if (/^story$/i.test(it.workType)) stat.stories += 1;
    if (done) {
      stat.done += 1;
      stat.deliveredSP += it.storyPoints || 0;
      stat.completedEstimateSeconds += it.originalEstimateSeconds || 0;
      if (isSubtask) stat.completedSubtasks += 1;
      else if (/^story$/i.test(it.workType)) stat.completedStories += 1;
    }
    devMap.set(name, stat);
  }
  const developers = Array.from(devMap.values())
    .map((stat) => ({
      name: stat.name,
      team: [...new Set(devItems.filter((item: any) => (item.assignee || "Unassigned") === stat.name).map((item: any) => item.podName || item.team))].join(", "),
      loggedHours: estimateHours(devItems.filter((item: any) => (item.assignee || "Unassigned") === stat.name).reduce((sum: number, item: any) => sum + (item.timeSpentSeconds || 0), 0)),
      unestimatedIssues: devItems.filter((item: any) => (item.assignee || "Unassigned") === stat.name && !(item.hasOriginalEstimate ?? ((item.originalEstimateSeconds || 0) > 0))).length,
      assignedIssues: stat.assigned,
      completedIssues: stat.done,
      assignedStories: stat.stories,
      assignedSubtasks: stat.subtasks,
      completedStories: stat.completedStories,
      completedSubtasks: stat.completedSubtasks,
      deliveredSP: Math.round(stat.deliveredSP),
      totalSP: Math.round(stat.totalSP),
      originalEstimateHours: estimateHours(stat.originalEstimateSeconds),
      completedEstimateHours: estimateHours(stat.completedEstimateSeconds),
      completionRate:
        stat.assigned > 0 ? Math.round((stat.done / stat.assigned) * 100) : 0,
    }))
    .sort((a, b) => b.deliveredSP - a.deliveredSP);

  const developerIssueList = devItems.map((i: any) => ({
    key: i.key,
    summary: i.summary,
    workType: i.workType,
    status: i.status,
    storyPoints: i.storyPoints || 0,
    podKey: i.podKey,
    podName: i.podName,
    sprint: i.sprints.length > 0 ? i.sprints.join(", ") : "Backlog",
    assignee: i.assignee || "Unassigned",
    priority: i.priority || "Medium",
    createdDate: i.createdDate || "",
    isDone: /^sub-?task$/i.test(i.workType)
      ? isSubtaskDoneStatus(i.status)
      : isDoneStatus(i.status),
    originalEstimateHours: estimateHours(i.originalEstimateSeconds),
    loggedEffortHours: estimateHours(i.timeSpentSeconds),
    isSubtask: /^sub-?task$/i.test(i.workType),
  }));

  const podFeatureList = podFeaturePool
    .map((i: any) => ({
      key: i.key,
      summary: i.summary,
      workType: i.workType,
      status: i.status,
      storyPoints: i.storyPoints || 0,
      podKey: i.podKey,
      podName: i.podName,
      sprint: i.sprints.length > 0 ? i.sprints.join(", ") : "Backlog",
      assignee: i.assignee || "Unassigned",
      priority: i.priority || "Medium",
      createdDate: i.createdDate || "",
      dueDate: i.dueDate || "",
      isDone: isDoneStatus(i.status),
      completionSprint: completionSprintFor(i) || undefined,
      resolutionDate: i.resolutionDate || undefined,
      originalEstimateHours: estimateHours(i.originalEstimateSeconds),
      reason: futureForecast.reasons.get(i.key),
    }));

  return {
    summary: {
      totalIssues,
      totalStoryPoints,
      completedIssues,
      completedStoryPoints,
      sayDoRatio: sayDo,
      carryoverRatio: carryover,
    },
    pods: podsWithAll,
    quarters,
    sprints: [
      { id: "all", name: "All Sprints", sub: `Latest ${sprints.length} sprints` },
      ...sprints,
    ],
    metrics: [
      {
        title: "Say/Do Ratio",
        value: `${savedSayDo}%`,
        subtitle: "Completed committed SP ÷ committed SP",
        trend: sayDoTrend,
        trendLabel: lastSprint && prevSprint ? "vs last sprint" : "",
        trendText: sayDoTrendText,
        color: savedSayDo >= 80 ? ("green" as const) : savedSayDo >= 65 ? ("blue" as const) : ("red" as const),
        trendGood: "up" as const,
        drilldownTab: "diagnosis",
      },
      {
        title: "Sprint Carry Over",
        value: `${savedCarry}%`,
        subtitle: "Spilled-over committed SP ÷ committed SP",
        trend: carryTrend,
        trendLabel: lastSprint && prevSprint ? "vs last sprint" : "",
        trendText: carryTrendText,
        color: savedCarry <= 18 ? ("green" as const) : savedCarry <= 28 ? ("blue" as const) : ("red" as const),
        trendGood: "down" as const,
        drilldownTab: "diagnosis",
      },
      {
        title: isGlobalAll ? "Avg. Sprint Velocity" : "Total Sprint Velocity",
        value: `${currentVelocity} pts`,
        subtitle: isGlobalAll
          ? `Average SP per sprint across ${velocityPodCount} pods`
          : "SP completed in latest sprint",
        trend: velocityTrendPct,
        trendLabel: lastSprint && prevSprint ? "vs last sprint" : "",
        trendText: velocityTrendText,
        color: "blue" as const,
        trendGood: "up" as const,
        drilldownTab: "executive",
      },
      {
        title: "Future Predictability",
        value: futureForecast.forecastableCount > 0 ? `${futureForecast.score}%` : "N/A",
        subtitle:
          futureForecast.forecastableCount > 0
            ? "Forecast on-time estimated features ÷ estimated features (future due dates)"
            : futureForecast.plannedCount > 0
            ? "No estimated remaining work on planned features"
            : "No late-stage features with future due dates",
        trend: 0,
        trendLabel:
          futureForecast.forecastableCount > 0
            ? "features on time"
            : "for forecast",
        trendText: futureTrendText,
        color:
          futureForecast.forecastableCount === 0
            ? ("blue" as const)
            : futureForecast.score >= 85
            ? ("green" as const)
            : futureForecast.score >= 50
            ? ("blue" as const)
            : ("red" as const),
        trendGood: "up" as const,
        drilldownTab: "predictability",
      },
    ],
    velocity: {
      labels: sprints.map((s) => s.name),
      completed: completedSeries,
      committed: committedSeries,
      totalFinished: completedSeries.reduce((a, b) => a + b, 0),
      avgLastThree,
      trendStatus,
    },
    delivery: {
      labels: sprints.map((s) => s.name),
      planned: committedSeries,
      committed: committedSeries,
      done: completedSeries,
      carried: sprints.map((s) => Math.max(s.storyPoints - s.doneStoryPoints, 0)),
    },
    developers,
    sprintAnalysis: {
      scopeChurnPct: 0,
      plannedWorkPct: 100,
      unplannedWorkPct: 0,
      avgCycleTimeDays: 0,
      avgLeadTimeDays: 0,
      workTypeBreakdown: [],
      statusBreakdown: [],
    },
    quality: {
      defectDensity: 0,
      totalBugs: 0,
      resolvedBugs: 0,
      resolutionRate: 0,
      avgResolutionDays: 0,
      priorityDistribution: [],
    },
    predictability: {
      score: predictabilityScore,
      varianceSP: Math.abs(scopeCommittedSP - scopeDoneSP),
      epicsOnSchedule: futureForecast.score,
      forecastableFeatures: futureForecast.forecastableCount,
      unestimatedFeatures: futureForecast.unestimatedCount,
      history: sprints.map((s) => ({
        sprint: s.name,
        planned: s.storyPoints,
        delivered: s.doneStoryPoints,
        sayDo: sprintSayDo(s),
      })),
    },
    trends: {
      velocityTrend: {
        labels: sprints.map((s) => s.name),
        velocity: completedSeries,
        movingAvg: completedSeries.map((_, idx) => {
          const slice = completedSeries.slice(0, idx + 1);
          return Math.round(slice.reduce((a, b) => a + b, 0) / slice.length);
        }),
      },
      cumulativeThroughput: {
        labels: sprints.map((s) => s.name),
        totalIssues: sprints.reduce<number[]>((acc, s) => {
          acc.push((acc[acc.length - 1] || 0) + s.issueCount);
          return acc;
        }, []),
        completedIssues: sprints.reduce<number[]>((acc, s) => {
          acc.push((acc[acc.length - 1] || 0) + s.doneIssueCount);
          return acc;
        }, []),
      },
    },
    diagnosis: {
      slippageSP: totalStoryPoints - completedStoryPoints,
      slippagePct: carryover * 100,
      primaryDriver: "Incomplete work",
      atRiskContributorsCount: 0,
      contributors: [],
      unfinishedIssues: items
        .filter((i) => !isDoneStatus(i.status))
        .slice(0, 150)
        .map((i) => ({
          key: i.key,
          summary: i.summary,
          workType: i.workType,
          status: i.status,
          storyPoints: i.storyPoints || 0,
          podKey: i.podKey,
          podName: i.podName,
          sprint: i.sprints.length > 0 ? i.sprints.join(", ") : "Backlog",
          assignee: i.assignee || "Unassigned",
          priority: i.priority || "Medium",
          reason: "Carried-Over Scope",
        })),
    },
    podFeatureList,
    qaCapacity: buildQaCapacity(items),
    issueList: items.map((i) => ({
      key: i.key,
      summary: i.summary,
      workType: i.workType,
      status: i.status,
      storyPoints: i.storyPoints,
      podKey: i.podKey,
      podName: i.podName,
      sprint: i.sprints.length > 0 ? i.sprints.join(", ") : "Backlog",
      assignee: i.assignee,
      priority: i.priority,
      createdDate: i.createdDate,
      dueDate: i.dueDate || "",
      isDone: isDoneStatus(i.status),
      completionSprint: completionSprintFor(i) || undefined,
      resolutionDate: i.resolutionDate || undefined,
      originalEstimateHours: estimateHours(i.originalEstimateSeconds),
      reason: futureForecast.reasons.get(i.key),
    })),
    developerIssueList,
  };
}

/**
 * Raw feed (same contract as the local /api/jira?raw=1 path):
 * unfiltered items + sprint metadata, served from app storage (KVS) when it
 * is fresh enough, refreshed on demand otherwise. Values are zlib-deflated
 * and chunked because KVS caps individual values.
 */
const FEED_META_KEY = "raw-feed-v12-meta";
const FEED_PART_KEY = "raw-feed-v12-part-";
// Legacy @forge/api storage caps a single persisted value at ~128 KB raw.
// 90 KB compressed -> ~120 KB base64, under the cap; a 930-item feed still
// needs a single part. Raise to ~175 KB after the @forge/kvs flip (240 KiB).
const FEED_PART_BYTES = 90 * 1024;
const FEED_TTL_MS = 5 * 60 * 1000;
const FEED_STALE_OK_MS = 30 * 60 * 1000;
const ZEPHYR_CACHE_META_KEY = "zephyr-feed-v1-meta";
const ZEPHYR_CACHE_PART_KEY = "zephyr-feed-v1-part-";
const ZEPHYR_CACHE_TTL_MS = 5 * 60 * 1000;

interface ZephyrCacheMeta {
  fetchedAt: number;
  parts: number;
  fingerprint: string;
}

function getZephyrCacheFingerprint(): string {
  return createHash("sha256")
    .update(`${process.env.JIRA_ZEPHYR_PROJECT_KEYS || ""}\n${process.env.JIRA_ZEPHYR_API_TOKEN || ""}`)
    .digest("hex");
}

async function readZephyrCache(fingerprint: string): Promise<ZephyrData | null> {
  const meta = await kvs.get(ZEPHYR_CACHE_META_KEY).catch(() => undefined) as ZephyrCacheMeta | undefined;
  if (!meta || meta.fingerprint !== fingerprint || Date.now() - meta.fetchedAt >= ZEPHYR_CACHE_TTL_MS) return null;
  const chunks = await Promise.all(Array.from({ length: meta.parts }, (_, index) =>
    kvs.get(`${ZEPHYR_CACHE_PART_KEY}${index + 1}`).catch(() => undefined)
  ));
  if (chunks.some((chunk) => typeof chunk !== "string")) return null;
  try {
    const json = zlib.inflateSync(Buffer.from((chunks as string[]).join(""), "base64")).toString("utf8");
    const data = JSON.parse(json) as ZephyrData;
    return typeof data.available === "boolean" ? data : null;
  } catch {
    return null;
  }
}

async function writeZephyrCache(fingerprint: string, data: ZephyrData): Promise<void> {
  if (!data.available) return;
  const compressed = zlib.deflateSync(Buffer.from(JSON.stringify(data))).toString("base64");
  const parts = Array.from({ length: Math.ceil(compressed.length / FEED_PART_BYTES) }, (_, index) =>
    compressed.slice(index * FEED_PART_BYTES, (index + 1) * FEED_PART_BYTES)
  );
  await Promise.all(parts.map((part, index) => kvs.set(`${ZEPHYR_CACHE_PART_KEY}${index + 1}`, part)));
  const previous = await kvs.get(ZEPHYR_CACHE_META_KEY).catch(() => undefined) as ZephyrCacheMeta | undefined;
  if (previous && typeof previous.parts === "number") {
    await Promise.all(Array.from({ length: Math.max(0, previous.parts - parts.length) }, (_, index) =>
      kvs.delete(`${ZEPHYR_CACHE_PART_KEY}${parts.length + index + 1}`).catch(() => undefined)
    ));
  }
  await kvs.set(ZEPHYR_CACHE_META_KEY, { fetchedAt: Date.now(), parts: parts.length, fingerprint } satisfies ZephyrCacheMeta);
}

// Shared with the resolver's metric behavior; mirrors the env rules so the
// browser computes with identical rules in both local and Forge modes.
function resolveFeedConfig() {
  return {
    doneStatuses: DONE_STATUSES ? Array.from(DONE_STATUSES) : ["Done", "Accepted"],
    subtaskDoneStatuses: SUBTASK_DONE_STATUSES
      ? Array.from(SUBTASK_DONE_STATUSES)
      : ["Done", "Closed", "Resolved", "Completed", "Released", "Accepted"],
    sprintWindow: 5,
    nextSprintRevealDays: 5,
    qaCapacityHoursPerWeek: Math.max(0, Number(process.env.JIRA_QA_CAPACITY_HOURS_PER_WEEK ?? 40)),
    qaTestIssueTypes: (
      process.env.JIRA_QA_TEST_ISSUE_TYPES || "Test"
    )
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    qaSupportIssueTypes: (
      process.env.JIRA_QA_SUPPORT_ISSUE_TYPES || "Support"
    )
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    qaMembers: (process.env.JIRA_QA_MEMBERS || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  };
}

interface FeedMeta {
  fetchedAt: number;
  parts: number;
}

interface FeedEnvelope {
  items: any[];
  qaDefects: any[];
  qaUatDefects?: any[];
  qaLeakageDefects?: any[];
  sprintMeta: Record<string, any>;
  jiraBaseUrl: string;
  fetchedAt: number;
  config: ReturnType<typeof resolveFeedConfig>;
  zephyr?: ZephyrData;
}

async function fetchAndStoreFeed(): Promise<FeedEnvelope> {
  const startedAt = Date.now();
  const config = await getFieldConfig();
  const fields = [
    "summary",
    "status",
    "issuetype",
    "project",
    "parent",
    "customfield_10014",
        ...(config.ahaUrlField ? [config.ahaUrlField] : []),
    "assignee",
    "reporter",
    "priority",
    "created",
    "resolutiondate",
    "duedate",
    "timeoriginalestimate",
        "timetracking",
    "timespent",
    config.storyPointsField,
    config.sprintField,
    config.podField,
  ];
  const baseDefectJql = config.jql.replace(/\s+ORDER\s+BY[\s\S]*$/i, "").trim();
  const defectJql = process.env.JIRA_QA_DEFECT_JQL?.trim() || `(${baseDefectJql}) AND issuetype = Bug`;
  const uatDefectJql = process.env.JIRA_QA_UAT_DEFECT_JQL?.trim() || "";
  const leakageDefectJql = process.env.JIRA_QA_LEAKAGE_DEFECT_JQL?.trim() || "";
  console.info("[JIRA_FETCH] Forge feed assembly started", {
    uatQueryConfigured: Boolean(uatDefectJql),
    leakageQueryConfigured: Boolean(leakageDefectJql),
    zephyrProjectCount: (process.env.JIRA_ZEPHYR_PROJECT_KEYS || "").split(",").filter((key) => key.trim()).length,
  });
  const [issues, defectIssues, uatDefectIssues, leakageDefectIssues] = await Promise.all([
    jiraClient.searchIssuesJql(config.jql, fields),
    jiraClient.searchIssuesJql(defectJql, fields),
    uatDefectJql ? jiraClient.searchIssuesJql(uatDefectJql, fields) : Promise.resolve([]),
    leakageDefectJql ? jiraClient.searchIssuesJql(leakageDefectJql, fields) : Promise.resolve([]),
  ]);
  await refreshSprintDetails(issues, config.sprintField, async (id) => {
    const response = await api.asApp().requestJira(route`/rest/agile/1.0/sprint/${id}`);
    return response.ok ? await response.json() as Record<string, unknown> : null;
  });
  const mapQaDefects = (source: any[]) => source.map((issue: any) => {
    const item = mapIssueToWorkItem(issue, config);
    return {
      key: item.key,
      summary: item.summary,
      workType: item.workType,
      status: item.status,
      storyPoints: item.storyPoints,
      podKey: item.podKey,
      podName: item.podName,
      sprint: item.sprints.length ? item.sprints.join(", ") : "Backlog",
      assignee: item.assignee || "Unassigned",
      reporter: item.reporter || "Unassigned",
      projectKey: item.projectKey,
      projectName: item.projectName,
      priority: item.priority || "Unspecified",
      createdDate: item.createdDate || "",
      resolutionDate: item.resolutionDate || undefined,
      dueDate: item.dueDate || "",
      isDone: isDoneStatus(item.status),
      originalEstimateHours: Math.round((item.originalEstimateSeconds || 0) / 360) / 10,
    };
  });
  const qaDefects = mapQaDefects(defectIssues);
  const envelope: FeedEnvelope = {
    qaDefects,
    ...(uatDefectJql ? { qaUatDefects: mapQaDefects(uatDefectIssues) } : {}),
    ...(leakageDefectJql ? { qaLeakageDefects: mapQaDefects(leakageDefectIssues) } : {}),
    items: inheritParentContext(
      issues.map((issue: any) => mapIssueToWorkItem(issue, config))
    ),
    sprintMeta: collectSprintMeta(issues, config.sprintField),
    jiraBaseUrl: (process.env.JIRA_HOST || "").replace(/\/+$/, ""),
    fetchedAt: Date.now(),
    config: resolveFeedConfig(),
  };

  console.info("[JIRA_FETCH] Forge feed assembled", {
    issueCount: envelope.items.length,
    defectCount: envelope.qaDefects.length,
    uatDefectCount: envelope.qaUatDefects?.length ?? null,
    leakageDefectCount: envelope.qaLeakageDefects?.length ?? null,
    durationMs: Date.now() - startedAt,
  });

  const compressed = zlib
    .deflateSync(Buffer.from(JSON.stringify(envelope)))
    .toString("base64");
  const parts: string[] = [];
  for (let i = 0; i < compressed.length; i += FEED_PART_BYTES) {
    parts.push(compressed.slice(i, i + FEED_PART_BYTES));
  }

  // Write data parts first, meta last: meta becomes the "commit marker".
  await Promise.all(
    parts.map((part, i) => kvs.set(`${FEED_PART_KEY}${i + 1}`, part))
  );
  const meta: FeedMeta = { fetchedAt: envelope.fetchedAt, parts: parts.length };
  // A shrinking feed leaves stray old parts; clear them before committing.
  const previous = (await kvs.get(FEED_META_KEY).catch(
    () => undefined
  )) as FeedMeta | undefined;
  if (previous && typeof previous.parts === "number") {
    for (let i = parts.length + 1; i <= previous.parts; i++) {
      await kvs.delete(`${FEED_PART_KEY}${i}`).catch(() => undefined);
    }
  }
  await kvs.set(FEED_META_KEY, meta);
  return envelope;
}

async function assembleFeed(meta: FeedMeta): Promise<FeedEnvelope | null> {
  const chunks: string[] = [];
  for (let i = 1; i <= meta.parts; i++) {
    const part = await kvs.get(`${FEED_PART_KEY}${i}`).catch(() => undefined);
    if (typeof part !== "string") return null;
    chunks.push(part);
  }
  try {
    const json = zlib.inflateSync(Buffer.from(chunks.join(""), "base64")).toString("utf8");
    return JSON.parse(json) as FeedEnvelope;
  } catch {
    return null;
  }
}

resolver.define("getDashboardData", async (req) => {
  const filters = (req.payload || {}) as Record<string, string>;

  try {
    const config = await getFieldConfig();

    // Fetch all issues from Jira using api.asApp() (privileged, no user context)
    const issues = await jiraClient.searchIssuesJql(config.jql, [
      "summary",
      "status",
      "issuetype",
      "project",
      "parent",
      "customfield_10014",
        ...(config.ahaUrlField ? [config.ahaUrlField] : []),
      "assignee",
      "priority",
      "created",
      "resolutiondate",
      "duedate",
      "timeoriginalestimate",
        "timetracking",
      "timespent",
      config.storyPointsField,
      config.sprintField,
      config.podField,
    ]);

    const allItems = inheritParentContext(
      issues.map((issue) => mapIssueToWorkItem(issue, config))
    ).filter((item) => !/^cancel{1,2}ed$/i.test(item.status.trim()));

    // Apply pod/quarter scope first. Future Predictability uses this broader
    // scope because a feature can span multiple sprints.
    let filteredScope = allItems;
    if (filters.podId && filters.podId !== "all") {
      filteredScope = filteredScope.filter((i) => i.podKey === filters.podId);
    }
    if (filters.quarterId && filters.quarterId !== "all") {
      filteredScope = filteredScope.filter((i) => i.quarter === filters.quarterId);
    }

    // Sprint filter applies to delivery metrics and Developer View.
    let filteredAll = filteredScope;
    if (filters.sprintId && filters.sprintId !== "all") {
      filteredAll = filteredAll.filter((i) => i.sprints.includes(filters.sprintId));
    }

    const filtered = filteredAll.filter((item) => !/^sub-?task$/i.test(item.workType));
    const forecastScope = filteredScope.filter(
      (item) => !/^sub-?task$/i.test(item.workType)
    );
    const forecastChildSource = allItems.filter(
      (item) =>
        !/^sub-?task$/i.test(item.workType) &&
        (!filters.podId || filters.podId === "all" || item.podKey === filters.podId)
    );
    const kpis = calculateKPIs(
      filtered,
      filters,
      filteredAll,
      forecastScope,
      forecastChildSource,
      collectSprintMeta(issues, config.sprintField)
    );

    return {
      timebox_id: filters.timeboxId || "all",
      pod_id: filters.podId || "all",
      kpi: kpis.summary,
      pods: kpis.pods,
      sprints: kpis.sprints,
      metrics: kpis.metrics,
      velocity: kpis.velocity,
      delivery: kpis.delivery,
      developers: kpis.developers,
      sprintAnalysis: kpis.sprintAnalysis,
      quality: kpis.quality,
      predictability: kpis.predictability,
      trends: kpis.trends,
      diagnosis: kpis.diagnosis,
      issueList: kpis.issueList,
      developerIssueList: kpis.developerIssueList,
      summary: kpis.summary,
      calculated_at: new Date().toISOString(),
      jiraBaseUrl: (process.env.JIRA_HOST || "").replace(/\/+$/, ""),
      source: "live_jira",
    };
  } catch (err) {
    console.error("Forge dashboard resolver error:", err);
    return {
      error: err instanceof Error ? err.message : "Unknown error",
      source: "live_jira",
    };
  }
});


resolver.define("getRawFeed", async (req) => {
  try {
    const forceRefresh = Boolean((req.payload as { refresh?: boolean } | undefined)?.refresh);
    if (forceRefresh) {
      const envelope = await fetchAndStoreFeed();
      return { ...envelope, source: "forge-live", ageMs: Date.now() - envelope.fetchedAt };
    }

    const metaRaw = (await kvs.get(FEED_META_KEY).catch(
      () => undefined
    )) as FeedMeta | undefined;
    const meta =
      metaRaw && typeof metaRaw.fetchedAt === "number" && typeof metaRaw.parts === "number"
        ? (metaRaw as FeedMeta)
        : null;

    if (meta) {
      const ageMs = Date.now() - meta.fetchedAt;
      if (ageMs <= FEED_TTL_MS) {
        const envelope = await assembleFeed(meta);
        if (envelope && Array.isArray(envelope.qaDefects)) {
          // Older cached envelopes may contain Zephyr data. Keep the raw Jira
          // resolver response small and let the Quality tab request Zephyr.
          const { zephyr: _legacyZephyr, ...jiraEnvelope } = envelope;
          return { ...jiraEnvelope, source: "kvs", ageMs };
        }
      } else if (ageMs <= FEED_STALE_OK_MS) {
        // # ponytail: Forge may cut post-response promises; if it does, the
        // next open pays the refresh instead of this user (still never both).
        const envelope = await assembleFeed(meta);
        if (envelope && Array.isArray(envelope.qaDefects)) {
          const { zephyr: _legacyZephyr, ...jiraEnvelope } = envelope;
          void fetchAndStoreFeed().catch((err: unknown) =>
            console.warn("[feed] background refresh failed:", err)
          );
          return { ...jiraEnvelope, source: "kvs-stale", ageMs };
        }
      }
    }

    // No commit marker (or unreadable parts): one live fetch, like first load.
    const envelope = await fetchAndStoreFeed();
    return {
      ...envelope,
      source: "forge-live",
      ageMs: Date.now() - envelope.fetchedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const statusCode = message.match(/(?:returned|failed:|rate limited)\s*(\d{3})\b/i)?.[1];
    const apiName = /zephyr/i.test(message) ? "Zephyr Essentials API" : /jira/i.test(message) ? "Jira API" : "Forge resolver";
    console.error("[JIRA_FETCH] Forge raw feed failed", { api: apiName, statusCode: statusCode ? Number(statusCode) : null, message });
    return {
      error: message,
      api: apiName,
      statusCode: statusCode ? Number(statusCode) : null,
      source: "forge-live",
    };
  }
});

/** Load optional Zephyr data only after the Jira feed is available. */
resolver.define("getZephyrData", async (req) => {
  try {
    const forceRefresh = Boolean((req.payload as { refresh?: boolean } | undefined)?.refresh);
    const fingerprint = getZephyrCacheFingerprint();
    if (!forceRefresh) {
      const cached = await readZephyrCache(fingerprint);
      if (cached) {
        console.info("[ZEPHYR_FETCH] Serving Forge cache", {
          caseCount: cached.testCasesTotal ?? cached.cases?.length ?? 0,
        });
        return cached;
      }
    }
    const metaRaw = (await kvs.get(FEED_META_KEY).catch(() => undefined)) as FeedMeta | undefined;
    const meta = metaRaw && typeof metaRaw.fetchedAt === "number" && typeof metaRaw.parts === "number"
      ? metaRaw
      : null;
    let envelope = meta ? await assembleFeed(meta) : null;
    if (!envelope || !Array.isArray(envelope.items)) {
      // Usually getRawFeed has just populated this. This fallback also handles
      // a direct Quality-tab request before the Jira feed cache exists.
      envelope = await fetchAndStoreFeed();
    }
    const config = await getFieldConfig();
    const data = await fetchZephyrExecutions(qaPoolFromItems(envelope.items), config);
    await writeZephyrCache(fingerprint, data).catch((error: unknown) => {
      console.warn("[ZEPHYR_FETCH] Could not cache Forge result", error);
    });
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Zephyr data could not be loaded.";
    console.error("[ZEPHYR_FETCH] Forge resolver failed", message);
    return { available: false, message } satisfies ZephyrData;
  }
});

resolver.define("getEvidence", async (req) => {
  const { issueKey } = (req.payload || {}) as Record<string, string>;
  if (!issueKey) return { error: "issueKey required" };

  try {
    const issue = await jiraClient.getIssue(issueKey);
    const fields = issue.fields || {};

    return {
      issue_key: issue.key,
      summary: fields.summary,
      status: fields.status?.name,
      issuetype: fields.issuetype?.name,
      project: fields.project?.key,
      assignee: fields.assignee?.displayName,
      created: fields.created,
      updated: fields.updated,
      resolutiondate: fields.resolutiondate,
      jira_url: `${(process.env.JIRA_HOST || "").replace(/\/+$/, "")}/browse/${issue.key}`,
      source: "live_jira",
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to fetch issue",
    };
  }
});

export const handler = resolver.getDefinitions();

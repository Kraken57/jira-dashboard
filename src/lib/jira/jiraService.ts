import { isJiraConfigured, missingJiraConfig, JIRA_CONFIG } from "./config";
import { DashboardData, DashboardFilters, JiraWorkItem, SprintMeta, ZephyrExecution, ZephyrTestCase } from "./types";
import { computeDashboardData, resolveMetricConfig } from "./metricsEngine";
import { RawFeedPayload, ZephyrData } from "./types";
import { deflateSync, inflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Derive the enterprise quarter id from a Jira sprint name.
 * Handles the different naming conventions used across Jira sites:
 *   "2026-Q3 Iteration 1"          -> "CY26 PI.3"
 *   "DTR 2026 - Q4 - Iteration 2"  -> "CY26 PI.4"
 *   "CY26 PI.3 Sprint 1"           -> "CY26 PI.3"
 */
export function quarterFromSprint(sprintName: string): string {
  if (!sprintName) return "All";

  // Year + quarter: "2026-Q3", "2026 - Q4", "2026 Q3"
  const yq = sprintName.match(/(\d{4})\s*-\s*Q\s*(\d)/i);
  if (yq) {
    return `CY${yq[1].slice(2)} PI.${parseInt(yq[2], 10)}`;
  }

  // Program increment style: "CY26 PI.3", "CY26 PI3"
  const pi = sprintName.match(/CY(\d{2})\s*PI\.?\s*(\d)/i);
  if (pi) {
    return `CY${pi[1]} PI.${parseInt(pi[2], 10)}`;
  }

  return "All";
}

/**
 * Fetches all issues from Jira Cloud with pagination.
 * Read-only. Uses Basic auth from environment variables.
 * Returns the mapped work items plus sprint metadata (state/dates) collected
 * from the Sprint field, so the dashboard can order sprints and reason about
 * the active/future ones without extra board API calls.
 */
async function fetchAllLiveJiraIssues(jqlOverride?: string, queryLabel = "dashboard"): Promise<{
  items: JiraWorkItem[];
  sprintMeta: Record<string, SprintMeta>;
}> {
  const { host, email, apiToken } = JIRA_CONFIG;
  const authHeader = Buffer.from(`${email}:${apiToken}`).toString("base64");
  const url = `${host.replace(/\/+$/, "")}/rest/api/3/search/jql`;

  const spField = process.env.JIRA_STORY_POINTS_FIELD || "customfield_10031";
  const sprintField = process.env.JIRA_SPRINT_FIELD || "customfield_10020";
  const podField = process.env.JIRA_POD_FIELD || "customfield_10050";
  const jql = jqlOverride || process.env.JIRA_JQL || "project in (DTR)";

  const allIssues: Record<string, unknown>[] = [];
  let nextPageToken: string | undefined = undefined;
  let pagesFetched = 0;

  for (let page = 0; page < 50; page++) {
    pagesFetched += 1;
    const requestBody: Record<string, unknown> = {
      jql,
      maxResults: 100,
      fields: [
        "summary",
        "status",
        "issuetype",
        "project",
        "parent",
        "customfield_10014",
        "assignee",
        "reporter",
        "priority",
        "created",
        "resolutiondate",
        "duedate",
        "timeoriginalestimate",
        spField,
        sprintField,
        podField,
      ],
    };

    if (nextPageToken) {
      requestBody.nextPageToken = nextPageToken;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${authHeader}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      let detail = body;
      try {
        const json = JSON.parse(body) as { errorMessages?: string[]; message?: string };
        detail = json.errorMessages?.join("; ") || json.message || body;
      } catch {
        // Jira sometimes returns HTML for gateway errors.
      }
      throw new Error(
        `Jira API returned ${response.status}: ${String(detail).slice(0, 500)}`
      );
    }

    const json = await response.json();
    if (!json || !Array.isArray(json.issues)) {
      throw new Error(`Jira ${queryLabel} search returned an unexpected response: missing issues array`);
    }
    allIssues.push(...json.issues);

    if (!json.nextPageToken) break;
    nextPageToken = json.nextPageToken;
  }

  console.info(`[jiraService] Jira ${queryLabel} search returned ${allIssues.length} issues across ${pagesFetched} page(s)`);

  const sprintMeta: Record<string, SprintMeta> = {};

  const items = allIssues.map((issue: Record<string, unknown>) => {
    const fields = (issue.fields || {}) as Record<string, unknown>;
    const project = (fields.project || {}) as Record<string, string>;
    const issuetype = (fields.issuetype || {}) as Record<string, string>;
    const status = (fields.status || {}) as Record<string, string>;
    const summary = String(fields.summary || "");
    const issueKey = String(issue.key || "");
    const workType = issuetype.name || "Story";

    const spRaw = fields[spField];
    const storyPoints =
      typeof spRaw === "number" ? spRaw : parseFloat(String(spRaw || "0")) || 0;

    const sprintObj = fields[sprintField];
    const sprints: string[] = [];

    if (Array.isArray(sprintObj)) {
      for (const s of sprintObj) {
        if (s && typeof s.name === "string") {
          const meta = s as { state?: string; startDate?: string; endDate?: string };
          s.name.split(",").forEach((part: string) => {
            const trimmed = part.trim();
            if (trimmed) {
              if (!sprintMeta[trimmed]) {
                sprintMeta[trimmed] = {
                  name: trimmed,
                  state: meta.state,
                  startDate: meta.startDate,
                  endDate: meta.endDate,
                };
              }
              if (!sprints.includes(trimmed)) sprints.push(trimmed);
            }
          });
        }
      }
    } else if (typeof sprintObj === "string") {
      sprintObj.split(",").forEach((part: string) => {
        const trimmed = part.trim();
        if (trimmed && !sprints.includes(trimmed)) {
          sprints.push(trimmed);
        }
      });
    }

    // POD field can be a plain string, or an option object {value, id}
    const podValue = fields[podField];
    const podKey = project.key || "UNKNOWN";
    let podName = project.name || podKey;
    if (typeof podValue === "string" && podValue) {
      podName = podValue;
    } else if (podValue && typeof podValue === "object") {
      const opt = podValue as { value?: string; name?: string };
      if (opt.value) podName = opt.value;
      else if (opt.name) podName = opt.name;
    }

    const assigneeObj = fields.assignee as { displayName?: string } | undefined;
    const reporterObj = fields.reporter as { displayName?: string } | undefined;
    const priorityObj = fields.priority as { name?: string } | undefined;
    const parentObj = fields.parent as { key?: string; id?: string; fields?: { issuetype?: { name?: string } } } | undefined;
    // Company-managed projects link stories to Epics/Features through the
    // "Epic Link" field instead of `parent`.
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
      quarter:
        sprints.length > 0
          ? quarterFromSprint(sprints[sprints.length - 1])
          : "All",
      sprints,
      storyPoints,
      team: project.name || "",
      projectKey: project.key || "UNKNOWN",
      projectName: project.name || project.key || "Unknown project",
      reporter: reporterObj?.displayName || "Unassigned",
      parentKey: parentObj?.key || epicLink || "",
      parentWorkType: parentObj?.fields?.issuetype?.name || "",
      parentId: parentObj?.id || "",
      createdDate: String(fields.created || ""),
      resolutionDate: fields.resolutiondate
        ? String(fields.resolutiondate)
        : undefined,
      dueDate: fields.duedate ? String(fields.duedate) : undefined,
      originalEstimateSeconds: Number(fields.timeoriginalestimate) || 0,
      updatedDate: String(fields.updated || ""),
    };
  });

  return { items, sprintMeta };
}

/**
 * Returns dashboard data from live Jira only.
 * No dummy data, no CSV, no JSON fallback.
 * If Jira is not configured, throws an error.
 *
 * The raw feed is cached on disk (not RAM) for a short TTL, so changing a
 * filter does not re-download the portfolio and a server restart keeps its
 * copy. When the copy is stale it is served immediately and refreshed in the
 * background; an in-flight guard makes parallel requests share one refresh.
 */
const CACHE_TTL_MS = Number(process.env.JIRA_CACHE_TTL_MS || 300000); // 5 min
const STALE_MAX_MS = Number(process.env.JIRA_CACHE_STALE_MAX_MS || 1800000); // 30 min
const CACHE_FILE = join(process.cwd(), ".cache", "jira-feed.json.deflate");

function getFeedQueries() {
  const mainJql = process.env.JIRA_JQL || "project in (DTR)";
  const baseDefectJql = mainJql.replace(/\s+ORDER\s+BY[\s\S]*$/i, "").trim();
  const defectJql = process.env.JIRA_QA_DEFECT_JQL?.trim() || `(${baseDefectJql}) AND issuetype = Bug`;
  const uatDefectJql = process.env.JIRA_QA_UAT_DEFECT_JQL?.trim() || "";
  const leakageDefectJql = process.env.JIRA_QA_LEAKAGE_DEFECT_JQL?.trim() || "";
  return { mainJql, defectJql, uatDefectJql, leakageDefectJql };
}

function getFeedQueryFingerprint(): string {
  const { mainJql, defectJql, uatDefectJql, leakageDefectJql } = getFeedQueries();
  const zephyrProjects = (process.env.JIRA_ZEPHYR_PROJECT_KEYS || "").trim();
  return createHash("sha256").update(`quality-cases-v4\n${mainJql}\n${defectJql}\n${uatDefectJql}\n${leakageDefectJql}\n${zephyrProjects}`).digest("hex");
}

let inflightFetch: Promise<RawFeedPayload> | null = null;

function readDiskFeed(): RawFeedPayload | null {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    const feed = JSON.parse(
      inflateSync(readFileSync(CACHE_FILE)).toString("utf8")
    ) as RawFeedPayload;
    if (!Array.isArray(feed.items)) return null;
    if (!Array.isArray(feed.qaDefects)) return null;
    if (feed.queryFingerprint !== getFeedQueryFingerprint()) return null;
    return feed;
  } catch {
    // Corrupt/half-written file: ignore, we will fetch live.
    return null;
  }
}

function writeDiskFeed(feed: RawFeedPayload): void {
  try {
    mkdirSync(join(CACHE_FILE, ".."), { recursive: true });
    writeFileSync(
      CACHE_FILE,
      deflateSync(Buffer.from(JSON.stringify(feed)))
    );
  } catch (err) {
    console.warn("[jiraService] Could not write feed cache:", err);
  }
}

/** Zephyr Essential Cloud v2.9 uses a UI-generated Bearer access token. */
async function fetchZephyrExecutions(jiraItems: JiraWorkItem[] = []): Promise<ZephyrData> {
  const token = process.env.JIRA_ZEPHYR_API_TOKEN?.trim();
  if (!token) return { available: false, message: "Configure JIRA_ZEPHYR_API_TOKEN to enable Zephyr Essentials data" };
  const projectKeys = (process.env.JIRA_ZEPHYR_PROJECT_KEYS || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  if (!projectKeys.length) return { available: false, message: "Set JIRA_ZEPHYR_PROJECT_KEYS to the Jira projects containing Zephyr tests" };

  const base = "https://prod-api.zephyr4jiracloud.com/v2";
  const requestAllPages = async (endpoint: string, projectKey: string) => {
    const firstUrl = new URL(`${base}/${endpoint}`);
    firstUrl.search = new URLSearchParams({ projectKey, startAt: "0", maxResults: "100" }).toString();
    let url: URL | null = firstUrl;
    let startAt = 0;
    let total: number | undefined;
    const values: Record<string, unknown>[] = [];
    const allowedHosts = new Set(["prod-api.zephyr4jiracloud.com", "prod-play.zephyr4jiracloud.com"]);
    let pageCount = 0;
    while (url && pageCount++ < 1000) {
      if (url.protocol !== "https:" || !allowedHosts.has(url.hostname)) {
        throw new Error("Zephyr returned an unexpected pagination URL");
      }
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Zephyr Essentials API GET ${url.pathname} for project ${projectKey} returned ${response.status}`);
      }
      const page = await response.json() as {
        values?: Record<string, unknown>[];
        total?: number;
        isLast?: boolean;
        next?: string;
        maxResults?: number;
      };
      const rows = page.values ?? [];
      if (total === undefined) total = page.total;
      values.push(...rows);
      startAt += rows.length;
      if (page.isLast === true || !rows.length) {
        url = null;
      } else if (page.next) {
        url = new URL(page.next, url);
      } else if (page.isLast === false || rows.length >= (page.maxResults ?? 100)) {
        const fallback = new URL(firstUrl);
        fallback.searchParams.set("startAt", String(startAt));
        url = fallback;
      } else {
        url = null;
      }
    }
    if (url) throw new Error(`Zephyr Essentials API pagination exceeded the safety limit for ${endpoint}`);
    return { values, total };
  };

  try {
    type RawProject = { key: string; name: string; testCases: Record<string, unknown>[]; executions: Record<string, unknown>[] };
    const projects: RawProject[] = [];
    const projectErrors: string[] = [];
    let totalTestCases = 0;
    for (const key of projectKeys) {
      try {
        const cases = await requestAllPages("testcases", key);
        totalTestCases += cases.total ?? cases.values.length;
        let executions: Record<string, unknown>[] = [];
        try {
          executions = (await requestAllPages("testexecutions", key)).values;
        } catch (error) {
          projectErrors.push(`${key} executions: ${error instanceof Error ? error.message : "request failed"}`);
        }
        const sourceName = jiraItems.find((item) => item.projectKey === key)?.projectName;
        projects.push({ key, name: sourceName || key, testCases: cases.values, executions });
      } catch (error) {
        projectErrors.push(`${key} test cases: ${error instanceof Error ? error.message : "request failed"}`);
      }
    }

    if (!projects.length) {
      return { available: false, message: projectErrors.join("; ") || "No Zephyr projects could be read" };
    }

    const asRecord = (value: unknown): Record<string, unknown> =>
      value && typeof value === "object" ? value as Record<string, unknown> : {};
    const pick = (record: Record<string, unknown>, keys: string[]) => {
      for (const key of keys) if (record[key] != null) return record[key];
      return undefined;
    };
    const personAccountId = (value: unknown) => {
      const person = asRecord(value);
      return String(pick(person, ["accountId", "accountID", "userKey"]) || "");
    };
    const personName = (value: unknown) => {
      if (typeof value === "string") return value;
      const person = asRecord(value);
      return String(pick(person, ["displayName", "name", "fullName", "username"]) || "");
    };
    type ProjectTestCase = Record<string, unknown> & {
      __projectKey: string;
      __projectName: string;
    };
    type ProjectTestExecution = Record<string, unknown> & {
      __projectKey: string;
    };
    const allCases: ProjectTestCase[] = projects.flatMap((project) =>
      project.testCases.map((testCase): ProjectTestCase => ({
        ...testCase,
        __projectKey: project.key,
        __projectName: project.name,
      }))
    );
    const allExecutions: ProjectTestExecution[] = projects.flatMap((project) =>
      project.executions.map((execution): ProjectTestExecution => ({
        ...execution,
        __projectKey: project.key,
      }))
    );
    const caseIdToKey = new Map(allCases.map((testCase) => [String(testCase.id || ""), String(testCase.key || "")]));
    const userIds = new Set<string>();
    for (const testCase of allCases) {
      const id = personAccountId(testCase.owner);
      if (id) userIds.add(id);
    }
    for (const execution of allExecutions) {
      for (const candidate of [execution.assignee, execution.assignedTo, execution.executedBy, execution.executor]) {
        const id = personAccountId(candidate);
        if (id) userIds.add(id);
      }
    }
    const jiraUserNames: Record<string, string> = {};
    const jiraProjectNames: Record<string, string> = {};
    const authHeader = Buffer.from(`${JIRA_CONFIG.email}:${JIRA_CONFIG.apiToken}`).toString("base64");
    const jiraGet = async (path: string) => fetch(`${JIRA_CONFIG.host.replace(/\/+$/, "")}${path}`, {
      headers: { Authorization: `Basic ${authHeader}`, Accept: "application/json" },
      cache: "no-store",
    });
    await Promise.all(Array.from(userIds).map(async (accountId) => {
      try {
        const response = await jiraGet(`/rest/api/3/user?accountId=${encodeURIComponent(accountId)}`);
        if (!response.ok) return;
        const user = await response.json() as { displayName?: string };
        if (user.displayName) jiraUserNames[accountId] = user.displayName;
      } catch { /* Keep the account ID as a visible fallback. */ }
    }));
    await Promise.all(projects.map(async ({ key }) => {
      try {
        const response = await jiraGet(`/rest/api/3/project/${encodeURIComponent(key)}`);
        if (!response.ok) return;
        const project = await response.json() as { name?: string };
        if (project.name) jiraProjectNames[key] = project.name;
      } catch { /* The project key remains a useful fallback. */ }
    }));

    const issueByKey = new Map(jiraItems.map((item) => [item.key, item]));
    const podsByProject = new Map<string, Map<string, string>>();
    for (const item of jiraItems) {
      const key = item.projectKey || item.podKey;
      if (!key || !item.podName) continue;
      const pods = podsByProject.get(key) || new Map<string, string>();
      pods.set(item.podKey || item.podName, item.podName);
      podsByProject.set(key, pods);
    }
    const statusNameCache = new Map<string, Promise<string>>();
    const referenceName = async (value: unknown, fallback: string): Promise<string> => {
      const ref = asRecord(value);
      const inline = pick(ref, ["name", "value", "displayName", "statusName"]);
      if (inline) return String(inline);
      const self = typeof ref.self === "string" ? ref.self : "";
      if (!self) return fallback;
      if (!statusNameCache.has(self)) statusNameCache.set(self, (async () => {
        try {
          const url = new URL(self);
          if (url.protocol !== "https:" || !["prod-api.zephyr4jiracloud.com", "prod-play.zephyr4jiracloud.com"].includes(url.hostname)) return fallback;
          const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
          if (!response.ok) return fallback;
          const body = asRecord(await response.json());
          return String(pick(body, ["name", "value", "displayName", "statusName"]) || fallback);
        } catch { return fallback; }
      })());
      return statusNameCache.get(self)!;
    };
    const statusCategory = (status: string): ZephyrExecution["statusCategory"] => {
      const normalized = status.toLowerCase();
      if (/pass|passed|success/.test(normalized)) return "passed";
      if (/fail|failed/.test(normalized)) return "failed";
      if (/block/.test(normalized)) return "blocked";
      if (/progress|wip|running|executing/.test(normalized)) return "in-progress";
      if (!normalized || /not executed|unexecuted|not started|pending|to do/.test(normalized)) return "pending";
      return "other";
    };
    const executionByCase = new Map<string, ZephyrExecution[]>();
    for (const execution of allExecutions) {
      const testCaseRef = asRecord(pick(execution, ["testCase", "testcase", "test"]));
      const testCaseKey = String(pick(execution, ["testCaseKey", "testcaseKey", "issueKey"]) ||
        (typeof execution.testCase === "string" ? execution.testCase : "") ||
        (typeof execution.testcase === "string" ? execution.testcase : "") ||
        testCaseRef.key || caseIdToKey.get(String(testCaseRef.id || execution.testCaseId || "")) || "");
      if (!testCaseKey) continue;
      const rawStatus = pick(execution, ["testExecutionStatus", "executionStatus", "status"]);
      const statusRef = asRecord(rawStatus);
      const statusId = String(statusRef.id || "");
      const status = await referenceName(rawStatus, statusId ? `Status ${statusId}` : "Not executed");
      const assignedTo = pick(execution, ["assignedTo", "assignee", "assignedTester"]);
      const executedBy = pick(execution, ["executedBy", "executor", "executedByUser"]);
      const executionId = String(pick(execution, ["id", "executionId", "key"]) || `${testCaseKey}-${executionByCase.get(testCaseKey)?.length || 0}`);
      const cycle = asRecord(pick(execution, ["testCycle", "cycle"]));
      const detail: ZephyrExecution = {
        id: executionId,
        status,
        statusCategory: statusCategory(status),
        assignedTo: personName(assignedTo) || jiraUserNames[personAccountId(assignedTo)] || personAccountId(assignedTo) || "Unassigned",
        executedBy: personName(executedBy) || jiraUserNames[personAccountId(executedBy)] || personAccountId(executedBy) || "Unrecorded",
        executedOn: String(pick(execution, ["executedOn", "actualEndDate", "updatedOn", "createdOn"]) || "") || undefined,
        cycle: String(pick(cycle, ["name", "key"]) || pick(execution, ["cycleName", "testCycleName"]) || ""),
      };
      const list = executionByCase.get(testCaseKey) || [];
      list.push(detail);
      executionByCase.set(testCaseKey, list);
    }
    const cases: ZephyrTestCase[] = [];
    for (const raw of allCases) {
      const key = String(raw.key || "");
      const projectKey = String(raw.__projectKey || key.match(/^(.+?)-T\d+$/i)?.[1] || "UNKNOWN");
      const projectName = jiraProjectNames[projectKey] || String(raw.__projectName || projectKey);
      const issueLinks = Array.isArray(asRecord(raw.links).issues) ? asRecord(raw.links).issues as unknown[] : [];
      const linkedIssueKeys = issueLinks
        .map((link) => typeof link === "string" ? link : String(pick(asRecord(link), ["key", "issueKey", "target"]) ||
          String(asRecord(link).self || "").match(/\/(?:browse|issue)\/([A-Z][A-Z0-9_]+-\d+)/i)?.[1] || ""))
        .filter((issueKey) => /^[A-Z][A-Z0-9_]*-\d+$/i.test(issueKey));
      const linkedIssueIds = issueLinks
        .map((link) => typeof link === "string" ? "" : String(pick(asRecord(link), ["issueId"]) || ""))
        .filter((issueId) => /^\d+$/.test(issueId));
      const linkedPods = new Map<string, string>();
      const linkedSprints = new Set<string>();
      for (const issueKey of linkedIssueKeys) {
        const issue = issueByKey.get(issueKey);
        if (issue) {
          linkedPods.set(issue.podKey, issue.podName || issue.podKey);
          for (const sprint of issue.sprints) if (sprint) linkedSprints.add(sprint);
        }
      }
      const projectPods = podsByProject.get(projectKey);
      const podSource: ZephyrTestCase["podSource"] = linkedPods.size
        ? "linked Jira issue"
        : projectPods?.size === 1 ? "project mapping" : "project fallback";
      const pods = linkedPods.size
        ? linkedPods
        : projectPods?.size === 1
          ? projectPods
          : new Map([[projectKey, projectName]]);
      const ownerAccountId = personAccountId(raw.owner) || undefined;
      const ownerName = personName(raw.owner) || (ownerAccountId ? jiraUserNames[ownerAccountId] || ownerAccountId : "Unassigned");
      const statusRef = raw.status;
      const priorityRef = raw.priority;
      const folderRef = raw.folder;
      const statusId = String(asRecord(statusRef).id || "");
      const priorityId = String(asRecord(priorityRef).id || "");
      const folderId = String(asRecord(folderRef).id || "");
      const executionHistory = (executionByCase.get(key) || []).sort((a, b) =>
        Date.parse(b.executedOn || "") - Date.parse(a.executedOn || "")
      );
      cases.push({
        id: String(raw.id || key),
        key,
        name: String(raw.name || key),
        projectKey,
        projectName,
        podKeys: Array.from(pods.keys()),
        podNames: Array.from(pods.values()),
        podSource,
        ownerName,
        ownerAccountId,
        status: await referenceName(statusRef, statusId ? `Status ${statusId}` : "Unknown"),
        priority: await referenceName(priorityRef, priorityId ? `Priority ${priorityId}` : "Unspecified"),
        folder: await referenceName(folderRef, folderId ? `Folder ${folderId}` : "Unfiled"),
        labels: Array.isArray(raw.labels) ? raw.labels.map(String) : [],
        linkedIssueKeys,
        linkedIssueIds,
        sprints: Array.from(linkedSprints).sort((a, b) => a.localeCompare(b)),
        createdOn: String(raw.createdOn || raw.createdDate || "") || undefined,
        objective: String(raw.objective || "") || undefined,
        precondition: String(raw.precondition || "") || undefined,
        executionCount: executionHistory.length,
        latestExecution: executionHistory[0],
        executions: executionHistory,
      });
    }
    const metricsByAlias: NonNullable<ZephyrData["metricsByAlias"]> = {};
    const norm = (name: string) => name.toLowerCase().replace(/[\s._-]/g, "");
    for (const execution of cases.flatMap((testCase) => testCase.executions)) {
      const owner = execution.executedBy !== "Unrecorded" ? execution.executedBy : execution.assignedTo;
      if (!owner || owner === "Unrecorded" || owner === "Unassigned") continue;
      const bucket = metricsByAlias[norm(owner)] ||= { pass: 0, fail: 0, wip: 0, blocked: 0, unexecuted: 0, total: 0 };
      bucket.total++;
      if (execution.statusCategory === "passed") bucket.pass++;
      else if (execution.statusCategory === "failed") bucket.fail++;
      else if (execution.statusCategory === "in-progress") bucket.wip++;
      else if (execution.statusCategory === "blocked") bucket.blocked++;
      else bucket.unexecuted++;
    }
    return {
      available: true,
      cases,
      metricsByAlias,
      testCasesTotal: totalTestCases,
      testExecutionsTotal: cases.reduce((total, testCase) => total + testCase.executionCount, 0),
      ...(projectErrors.length ? { message: `Partial Zephyr data: ${projectErrors.join("; ")}` } : {}),
    };
  } catch (err) {
    return { available: false, message: err instanceof Error ? err.message : "Zephyr Cloud unavailable" };
  }
}

async function fetchLiveFeed(): Promise<RawFeedPayload> {
  const { mainJql, defectJql, uatDefectJql, leakageDefectJql } = getFeedQueries();
  const [live, defectFeed, uatDefectFeed, leakageDefectFeed] = await Promise.all([
    fetchAllLiveJiraIssues(mainJql, "dashboard"),
    fetchAllLiveJiraIssues(defectJql, "QA defects"),
    uatDefectJql ? fetchAllLiveJiraIssues(uatDefectJql, "QA UAT defects") : Promise.resolve({ items: [], sprintMeta: {} }),
    leakageDefectJql ? fetchAllLiveJiraIssues(leakageDefectJql, "QA leaked defects") : Promise.resolve({ items: [], sprintMeta: {} }),
  ]);
  const zephyr = await fetchZephyrExecutions(live.items);
  if (zephyr.available && zephyr.cases?.length) {
    const linkedIdToKey = new Map<string, string>();
    const linkedIds = Array.from(new Set(zephyr.cases.flatMap((testCase) => testCase.linkedIssueIds ?? [])));
    const authHeader = Buffer.from(`${JIRA_CONFIG.email}:${JIRA_CONFIG.apiToken}`).toString("base64");
    for (let offset = 0; offset < linkedIds.length; offset += 8) {
      const chunk = linkedIds.slice(offset, offset + 8);
      const resolved = await Promise.all(chunk.map(async (issueId) => {
        try {
          const response = await fetch(`${JIRA_CONFIG.host.replace(/\/+$/, "")}/rest/api/3/issue/${issueId}?fields=key`, {
            headers: { Authorization: `Basic ${authHeader}`, Accept: "application/json" },
            cache: "no-store",
          });
          if (!response.ok) return null;
          const issue = await response.json() as { key?: string };
          return issue.key ? [issueId, issue.key] as const : null;
        } catch {
          return null;
        }
      }));
      for (const entry of resolved) if (entry) linkedIdToKey.set(entry[0], entry[1]);
    }
    const lookupKeys = Array.from(new Set(zephyr.cases.flatMap((testCase) => [
      testCase.key,
      ...testCase.linkedIssueKeys,
      ...(testCase.linkedIssueIds ?? []).map((id) => linkedIdToKey.get(id) || ""),
    ])))
      .filter((key) => /^[A-Z][A-Z0-9_]*-\d+$/i.test(key));
    const sprintItems: JiraWorkItem[] = [];
    try {
      // Zephyr test projects are not always part of JIRA_JQL. Fetch their Jira
      // issues separately so their Sprint field (and linked story sprints) is
      // available without widening the dashboard's main issue scope.
      for (let offset = 0; offset < lookupKeys.length; offset += 80) {
        const chunk = lookupKeys.slice(offset, offset + 80);
        if (!chunk.length) continue;
        const jql = `key in (${chunk.join(", ")})`;
        sprintItems.push(...await fetchAllLiveJiraIssues(jql, "Zephyr sprint mapping"));
      }
      const byKey = new Map(sprintItems.map((item) => [item.key, item]));
      zephyr.cases = zephyr.cases.map((testCase) => {
        const resolvedKeys = (testCase.linkedIssueIds ?? []).map((id) => linkedIdToKey.get(id) || "").filter(Boolean);
        const linkedIssueKeys = Array.from(new Set([...testCase.linkedIssueKeys, ...resolvedKeys]));
        const linkedItems = linkedIssueKeys.map((key) => byKey.get(key)).filter((item): item is JiraWorkItem => Boolean(item));
        const linkedSprints = linkedItems.flatMap((item) => item.sprints);
        const caseSprints = byKey.get(testCase.key)?.sprints ?? [];
        const linkedPods = new Map(linkedItems.map((item) => [item.podKey, item.podName || item.podKey]));
        return {
          ...testCase,
          linkedIssueKeys,
          ...(linkedPods.size ? { podKeys: Array.from(linkedPods.keys()), podNames: Array.from(linkedPods.values()), podSource: "linked Jira issue" as const } : {}),
          sprints: Array.from(new Set(linkedSprints.length ? linkedSprints : caseSprints.length ? caseSprints : testCase.sprints)),
        };
      });
      if (zephyr.cases.length && !zephyr.cases.some((testCase) => testCase.sprints.length)) {
        zephyr.message = [zephyr.message, "No Jira sprint assignments were found for Zephyr test cases or linked issues; verify Jira visibility and sprint assignment"]
          .filter(Boolean).join("; ");
      }
    } catch (error) {
      console.warn("[jiraService] Could not map Jira sprints for Zephyr cases:", error);
      zephyr.message = [zephyr.message, `Jira sprint lookup unavailable: ${error instanceof Error ? error.message : "request failed"}`]
        .filter(Boolean).join("; ");
    }
  }
  const doneStatuses = new Set(resolveMetricConfig().doneStatuses);
  const mapDefects = (items: JiraWorkItem[]) => items.map((item) => ({
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
    isDone: doneStatuses.has(item.status),
    originalEstimateHours: Math.round((item.originalEstimateSeconds || 0) / 360) / 10,
  }));
  const qaDefects = mapDefects(defectFeed.items);
  return {
    items: live.items,
    qaDefects,
    ...(uatDefectJql ? { qaUatDefects: mapDefects(uatDefectFeed.items) } : {}),
    ...(leakageDefectJql ? { qaLeakageDefects: mapDefects(leakageDefectFeed.items) } : {}),
    queryFingerprint: getFeedQueryFingerprint(),
    sprintMeta: live.sprintMeta,
    jiraBaseUrl: (JIRA_CONFIG.host || "").replace(/\/+$/, ""),
    fetchedAt: Date.now(),
    config: resolveMetricConfig(),
    zephyr,
    source: "jira-live",
  };
}

// Dedupes concurrent refreshes. This guards work in flight, it caches nothing.
async function withInflight(job: () => Promise<RawFeedPayload>): Promise<RawFeedPayload> {
  if (!inflightFetch) {
    inflightFetch = job().finally(() => {
      inflightFetch = null;
    });
  }
  return inflightFetch;
}

/**
 * Raw feed for the browser: unfiltered items + sprint metadata.
 * - fresh copy on disk -> serve instantly
 * - stale copy (<= 30 min old) -> serve it AND refresh quietly in background
 * - no/too-old copy -> block on one live Jira fetch (the only slow moment)
 */
export async function getRawFeed(forceRefresh = false): Promise<RawFeedPayload> {
  if (!isJiraConfigured()) {
    throw new Error(
      `Jira is not configured. Missing ${missingJiraConfig().join(", ")} in .env.local`
    );
  }

  const disk = forceRefresh ? null : readDiskFeed();
  const ageMs = disk ? Date.now() - disk.fetchedAt : Infinity;

  if (disk && ageMs <= CACHE_TTL_MS) {
    return { ...disk, config: resolveMetricConfig(), source: "disk", ageMs };
  }

  if (disk && ageMs <= STALE_MAX_MS) {
    // Serve stale now; refresh quietly. Never make the user wait here.
    void withInflight(fetchLiveFeed).then(writeDiskFeed).catch((err) => {
      console.warn("[jiraService] Background feed refresh failed:", err);
    });
    return { ...disk, config: resolveMetricConfig(), source: "disk-stale", ageMs };
  }

  // # ponytail: single global refresh guard; per-account keys only if the
  // refresh queue ever contends across Jira instances (it cannot today).
  const feed = await withInflight(fetchLiveFeed);
  writeDiskFeed(feed);
  return { ...feed, config: resolveMetricConfig(), source: "jira-live", ageMs: Date.now() - feed.fetchedAt };
}

/**
 * Legacy per-filter compute path (kept as fallback, reads the same disk cache;
 * blocks on a fresh fetch when the copy is stale).
 */
export async function getDashboardData(
  filters: DashboardFilters = { podId: "all", quarterId: "all", sprintId: "all" }
): Promise<DashboardData> {
  if (!isJiraConfigured()) {
    throw new Error(
      `Jira is not configured. Missing ${missingJiraConfig().join(", ")} in .env.local`
    );
  }

  const disk = readDiskFeed();
  const fresh = disk && Date.now() - disk.fetchedAt <= CACHE_TTL_MS;
  const feed = fresh
    ? (disk as RawFeedPayload)
    : await withInflight(fetchLiveFeed).then((f) => (writeDiskFeed(f), f));

  return {
    ...computeDashboardData(feed.items, filters, feed.sprintMeta, resolveMetricConfig(), feed.zephyr),
    jiraBaseUrl: feed.jiraBaseUrl,
  };
}

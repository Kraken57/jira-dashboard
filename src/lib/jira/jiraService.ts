import { isJiraConfigured, missingJiraConfig, JIRA_CONFIG } from "./config";
import { DashboardData, DashboardFilters, JiraWorkItem, SprintMeta } from "./types";
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
    const parentObj = fields.parent as { key?: string; id?: string } | undefined;
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
      priority: priorityObj?.name || "Medium",
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
  return createHash("sha256").update(`${mainJql}\n${defectJql}\n${uatDefectJql}\n${leakageDefectJql}`).digest("hex");
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
async function fetchZephyrExecutions(): Promise<ZephyrData> {
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
    const metricsByAlias: Record<
      string,
      { pass: number; fail: number; wip: number; blocked: number; unexecuted: number; total: number }
    > = {};
    const norm = (n: string) => n.toLowerCase().replace(/[\s._-]/g, "");
    let totalTestCases = 0;
    let successfulProjects = 0;
    const projectErrors: string[] = [];
    for (const key of projectKeys) {
      try {
        const cases = await requestAllPages("testcases", key);
        totalTestCases += cases.total ?? cases.values.length;
        successfulProjects += 1;
        const executions = await requestAllPages("testexecutions", key);
        for (const e of executions.values) {
          const ownerValue = e.executedBy || e.executedByName || e.assignedTo || e.assignedToName || e.assignee;
          const owner = typeof ownerValue === "object" && ownerValue
            ? String((ownerValue as Record<string, unknown>).displayName || (ownerValue as Record<string, unknown>).name || "")
            : String(ownerValue || "");
          if (!owner || /unassigned/i.test(owner)) continue;
          const bucket = (metricsByAlias[norm(owner)] ||= {
            pass: 0,
            fail: 0,
            wip: 0,
            blocked: 0,
            unexecuted: 0,
            total: 0,
          });
          bucket.total += 1;
          const rawStatus = e.testExecutionStatus ?? e.executionStatus ?? e.status;
          const status = String(typeof rawStatus === "object" && rawStatus
            ? (rawStatus as Record<string, unknown>).name ?? (rawStatus as Record<string, unknown>).status ?? ""
            : rawStatus ?? e.testExecutionStatusName ?? "").toLowerCase();
          if (/pass/.test(status)) bucket.pass += 1;
          else if (/fail/.test(status)) bucket.fail += 1;
          else if (/progress|wip/.test(status)) bucket.wip += 1;
          else if (/block/.test(status)) bucket.blocked += 1;
          else bucket.unexecuted += 1;
        }
      } catch (error) {
        projectErrors.push(`${key}: ${error instanceof Error ? error.message : "request failed"}`);
      }
    }
    if (!successfulProjects) {
      return { available: false, message: projectErrors.join("; ") || "No Zephyr projects could be read" };
    }
    return {
      available: true,
      metricsByAlias,
      testCasesTotal: totalTestCases,
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
  const zephyr = await fetchZephyrExecutions();
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
    priority: item.priority || "Medium",
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

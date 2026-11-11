/** Read-only sprint audit. Never prints Jira credentials or issue descriptions. */
import { readFileSync } from "node:fs";

const fileEnv = {};
try {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Z_][A-Z_0-9]*)\s*=\s*(.*)$/);
    if (match) fileEnv[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
} catch { /* Environment variables can supply configuration. */ }
const env = (key, fallback = "") => process.env[key] || fileEnv[key] || fallback;
const argument = (name) => process.argv[process.argv.indexOf(name) + 1];
const project = process.argv.includes("--project") ? argument("--project") : "";
const board = process.argv.includes("--board") ? argument("--board") : "";
if (!/^[A-Z][A-Z0-9_]*$/i.test(project) || !/^\d+$/.test(board)) {
  console.error("Usage: node scripts/inspect-sprints.mjs --project ERP --board 237");
  process.exit(1);
}
const host = env("JIRA_HOST").replace(/\/+$/, "");
if (!host || !env("JIRA_EMAIL") || !env("JIRA_API_TOKEN")) {
  console.error("Configure JIRA_HOST, JIRA_EMAIL and JIRA_API_TOKEN in .env.local.");
  process.exit(1);
}
const headers = {
  Authorization: `Basic ${Buffer.from(`${env("JIRA_EMAIL")}:${env("JIRA_API_TOKEN")}`).toString("base64")}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};
const request = async (path, body) => {
  const response = await fetch(`${host}${path}`, {
    headers, method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`${path.split("?")[0]} returned HTTP ${response.status}`);
  return response.json();
};
const listSprints = async () => {
  const sprints = [];
  for (let page = 0; page < 1000; page++) {
    const data = await request(`/rest/agile/1.0/board/${board}/sprint?startAt=${sprints.length}&maxResults=100`);
    const rows = data.values || [];
    sprints.push(...rows);
    if (data.isLast || !rows.length || (typeof data.total === "number" && sprints.length >= data.total)) return sprints;
  }
  throw new Error("Sprint pagination safety limit exceeded");
};
const sprintField = env("JIRA_SPRINT_FIELD", "customfield_10020");
const spField = env("JIRA_STORY_POINTS_FIELD", "customfield_10031");
const search = async (jql) => {
  const issues = [];
  let nextPageToken;
  const seen = new Set();
  for (let page = 0; page < 1000; page++) {
    const data = await request("/rest/api/3/search/jql", {
      jql, fields: ["issuetype", "status", "resolutiondate", sprintField, spField],
      maxResults: 100, ...(nextPageToken ? { nextPageToken } : {}),
    });
    if (!Array.isArray(data.issues)) throw new Error("Search response omitted issues");
    issues.push(...data.issues);
    if (data.isLast || !data.nextPageToken) return issues;
    if (seen.has(data.nextPageToken)) throw new Error("Search repeated pagination token");
    nextPageToken = data.nextPageToken;
    seen.add(nextPageToken);
  }
  throw new Error("Issue pagination safety limit exceeded");
};
const quarter = (name) => {
  const match = name.match(/(\d{4})\s*-?\s*Q\s*(\d)/i);
  if (match) return `CY${match[1].slice(2)} PI.${match[2]}`;
  const pi = name.match(/CY(\d{2})\s*PI\.?\s*(\d)/i);
  return pi ? `CY${pi[1]} PI.${pi[2]}` : null;
};
try {
  const baseJql = env("JIRA_JQL", `project = ${project}`).replace(/\s+ORDER\s+BY[\s\S]*$/i, "");
  const jql = `(${baseJql}) AND project = ${project}`;
  const [sprints, issues] = await Promise.all([listSprints(), search(jql)]);
  const byId = new Map(sprints.map((s) => [String(s.id), { ...s, onSelectedBoard: true }]));
  const counts = new Map();
  let missingSprintIds = 0;
  for (const issue of issues) {
    const fields = issue.fields || {};
    if (!Array.isArray(fields[sprintField])) continue;
    for (const sprint of fields[sprintField]) {
      if (!sprint?.id) { missingSprintIds++; continue; }
      const id = String(sprint.id);
      if (!byId.has(id)) byId.set(id, { ...sprint, onSelectedBoard: false });
      const bucket = counts.get(id) || { fetchedWorkItems: 0, dashboardWorkItems: 0, storyPoints: 0, statuses: {} };
      bucket.fetchedWorkItems++;
      const status = fields.status?.name || "Unknown";
      bucket.statuses[status] = (bucket.statuses[status] || 0) + 1;
      if (!/^sub-?task$/i.test(fields.issuetype?.name || "") && !/^cancel{1,2}ed$/i.test(status.trim())) {
        bucket.dashboardWorkItems++;
        bucket.storyPoints += Number(fields[spField]) || 0;
      }
      counts.set(id, bucket);
    }
  }
  console.log(JSON.stringify({
    host, project, board: Number(board), jql, fetchedIssues: issues.length, missingSprintIds,
    note: "Counts use current statuses and configured dashboard JQL. A work item may appear in several historical sprints. This is not a sprint-start snapshot.",
    sprints: [...byId.values()].sort((a, b) => String(a.startDate || "").localeCompare(String(b.startDate || ""))).map((s) => ({
      id: s.id, name: s.name, quarter: quarter(s.name || ""), state: s.state,
      startDate: s.startDate, endDate: s.endDate, completeDate: s.completeDate,
      originBoardId: s.originBoardId, onSelectedBoard: s.onSelectedBoard,
      ...(counts.get(String(s.id)) || { fetchedWorkItems: 0, dashboardWorkItems: 0, storyPoints: 0, statuses: {} }),
    })),
  }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

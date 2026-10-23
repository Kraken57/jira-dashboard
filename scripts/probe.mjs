/**
 * Field / status profiler.
 * Run: pnpm probe
 *
 * Answers the questions that `discover:fields` cannot:
 *   - which candidate field actually holds Story Points on this site
 *   - which candidate field holds the POD / Team
 *   - which statuses count as "done"
 *
 * Environment resolution order:
 *   1. process.env
 *   2. .env.local
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

function loadEnvFile() {
  const env = {};
  try {
    const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
  } catch {
    console.warn(".env.local not found - using environment variables only");
  }
  return env;
}

const fileEnv = loadEnvFile();
const pick = (key) => process.env[key] || fileEnv[key] || "";

const HOST = pick("JIRA_HOST").replace(/\/+$/, "");
const EMAIL = pick("JIRA_EMAIL");
const TOKEN = pick("JIRA_API_TOKEN");
const JQL = pick("JIRA_JQL") || "project in (DTR)";
const ISSUE_TYPE = pick("JIRA_DISCOVERY_ISSUE_TYPE") || "Story";

if (!HOST || !EMAIL || !TOKEN) {
  console.error("Missing JIRA_HOST / JIRA_EMAIL / JIRA_API_TOKEN");
  process.exit(1);
}

const authHeader = Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64");
const headers = {
  Authorization: `Basic ${authHeader}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};

async function jiraGet(path) {
  const res = await fetch(`${HOST}${path}`, { headers, cache: "no-store" });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status} ${res.statusText}`);
  return res.json();
}

async function jiraPost(path, body) {
  const res = await fetch(`${HOST}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status} ${res.statusText}`);
  return res.json();
}

function flat(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value
      .map((v) =>
        v && typeof v === "object" ? v.name || v.value || JSON.stringify(v) : String(v)
      )
      .join(", ");
  }
  if (typeof value === "object") {
    return (value.value || value.name || value.key || JSON.stringify(value)).toString();
  }
  return String(value);
}

async function main() {
  console.log(`Host: ${HOST}`);
  console.log(`JQL:  ${JQL}`);
  console.log(`Type: ${ISSUE_TYPE}\n`);

  console.log("Checking authentication...");
  let me;
  try {
    me = await jiraGet("/rest/api/3/myself");
    console.log(`Authenticated as: ${me.emailAddress || me.displayName || me.accountId}\n`);
  } catch (err) {
    console.error("\n*** AUTH FAILED ***");
    console.error(err.message);
    process.exit(1);
  }

  // Fetch issues of the target type
  let token;
  const issues = [];
  while (true) {
    const body = {
      jql: `${JQL} AND issuetype = "${ISSUE_TYPE}"`,
      maxResults: 100,
      fields: ["*all"],
    };
    if (token) body.nextPageToken = token;
    const json = await jiraPost("/rest/api/3/search/jql", body);
    issues.push(...(json.issues || []));
    token = json.nextPageToken;
    if (!token) break;
  }
  console.log(`Fetched ${issues.length} "${ISSUE_TYPE}" issues\n`);

  if (issues.length === 0) {
    console.error(
      `No "${ISSUE_TYPE}" issues match the JQL. Try a different JIRA_JQL or set ` +
        `JIRA_DISCOVERY_ISSUE_TYPE to another issue type.`
    );
    process.exit(1);
  }

  // Status distribution
  const statusCounts = {};
  for (const i of issues) {
    const name = i.fields?.status?.name;
    if (name) statusCounts[name] = (statusCounts[name] || 0) + 1;
  }
  console.log("=== STATUS NAMES (pick the 'done' ones for JIRA_DONE_STATUSES) ===");
  for (const [s, c] of Object.entries(statusCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(c).padStart(5)}  ${s}`);
  }

  // Field value profile - every custom field that has a value
  const fields = await jiraGet("/rest/api/3/field");
  const custom = fields.filter((f) => f.custom);
  const profile = [];
  for (const f of custom) {
    const vals = issues
      .map((i) => i.fields?.[f.id])
      .filter((v) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0));
    if (vals.length === 0) continue;
    const numeric = vals.every(
      (v) => typeof v === "number" || !isNaN(parseFloat(String(v)))
    );
    profile.push({ id: f.id, name: f.name, filled: vals.length, numeric, sample: vals.slice(0, 3).map(flat) });
  }

  console.log("\n=== FIELDS WITH VALUES (on these issues) ===");
  console.log("numeric=true  -> likely Story Points\n");
  for (const p of profile.sort((a, b) => b.filled - a.filled)) {
    console.log(
      `  ${p.id.padEnd(20)} ${String(p.name).padEnd(38)} ${String(p.filled).padStart(4)}/${issues.length}` +
        ` numeric=${p.numeric ? "YES" : "no "}  e.g. ${JSON.stringify(p.sample).slice(0, 70)}`
    );
  }

  // Sprint field detail
  const sprintField = pick("JIRA_SPRINT_FIELD");
  if (sprintField) {
    console.log(`\n=== SPRINT FIELD RAW (${sprintField}) ===`);
    const withSprint = issues.find((i) => i.fields?.[sprintField]);
    console.log(JSON.stringify(withSprint?.fields?.[sprintField], null, 2).slice(0, 600));
  }

  console.log(`
Next: copy the Story Points / Team field IDs and the done statuses into .env.local
`);
}

main().catch((err) => {
  console.error("Probe failed:", err.message);
  process.exit(1);
});

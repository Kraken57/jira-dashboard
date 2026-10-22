/**
 * Jira field discovery helper.
 * Run: node scripts/discover-fields.mjs
 *
 * Lists all custom fields visible to your API token, with sample values pulled
 * from a real issue, so you can identify which customfield_xxxxx is:
 *   - Story Points
 *   - Sprint
 *   - POD
 *
 * Then copy the values into .env.local:
 *   JIRA_STORY_POINTS_FIELD=customfield_XXXXX
 *   JIRA_SPRINT_FIELD=customfield_XXXXX
 *   JIRA_POD_FIELD=customfield_XXXXX
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

function loadEnv() {
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
    console.error("Could not read .env.local");
    process.exit(1);
  }
  return env;
}

const env = loadEnv();
const HOST = (env.JIRA_HOST || "").replace(/\/+$/, "");
const EMAIL = env.JIRA_EMAIL || "";
const TOKEN = env.JIRA_API_TOKEN || "";
const JQL = env.JIRA_JQL || "project in (DTR)";

if (!HOST || !EMAIL || !TOKEN) {
  console.error("Missing JIRA_HOST / JIRA_EMAIL / JIRA_API_TOKEN in .env.local");
  process.exit(1);
}

const auth = Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64");
const headers = {
  Authorization: `Basic ${auth}`,
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

function describe(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value
      .map((v) => (v && typeof v === "object" ? v.name || v.value || JSON.stringify(v) : String(v)))
      .join(", ")
      .slice(0, 90);
  }
  if (typeof value === "object") {
    return (value.name || value.value || value.key || JSON.stringify(value)).toString().slice(0, 90);
  }
  return String(value).slice(0, 90);
}

async function main() {
  console.log(`Host: ${HOST}`);
  console.log(`JQL:  ${JQL}\n`);

  // 1. Fetch one real issue to use as a sample
  let sample = null;
  try {
    const search = await jiraPost("/rest/api/3/search/jql", {
      jql: `${JQL} ORDER BY updated DESC`,
      maxResults: 3,
      fields: ["*all"],
    });
    sample = search.issues?.[0] || null;
    if (!sample) {
      console.warn("No issues found for this JQL. Field list will show names only.");
    }
  } catch (err) {
    console.warn("Issue search failed:", err.message);
  }

  // 2. List all fields
  const fields = await jiraGet("/rest/api/3/field");
  const custom = fields.filter((f) => f.custom);

  console.log(`\n=== ${custom.length} custom fields ===\n`);

  for (const f of custom) {
    const sampleVal = sample?.fields?.[f.id];
    const shown = describe(sampleVal);
    console.log(`${f.id.padEnd(22)} ${String(f.name).padEnd(42)} ${shown ? `| ${shown}` : ""}`);
  }

  // 3. Also show standard fields present on the sample issue (helps spot status/done fields)
  if (sample) {
    console.log("\n=== Sample issue ===");
    console.log(`Key:    ${sample.key}`);
    console.log(`Type:   ${sample.fields.issuetype?.name}`);
    console.log(`Status: ${sample.fields.status?.name} (${sample.fields.status?.statusCategory?.key})`);
    console.log(`Assign: ${sample.fields.assignee?.displayName || "Unassigned"}`);
    console.log(`Parent: ${sample.fields.parent?.key || "none"}`);
    console.log(`Project:${sample.fields.project?.key}`);
  }

  console.log(`
Next steps:
1. Find the field whose value is a number like 3, 5, 8  -> Story Points
2. Find the field whose value looks like a sprint name -> Sprint
3. Find the field whose value matches your team name     -> POD
4. Add to .env.local:
     JIRA_STORY_POINTS_FIELD=customfield_XXXXX
     JIRA_SPRINT_FIELD=customfield_XXXXX
     JIRA_POD_FIELD=customfield_XXXXX
`);
}

main().catch((err) => {
  console.error("Discovery failed:", err.message);
  process.exit(1);
});

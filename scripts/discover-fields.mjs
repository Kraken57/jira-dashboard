/**
 * Jira field discovery helper.
 * Run: pnpm discover:fields
 *
 * Lists all custom fields visible to your API token, with sample values pulled
 * from a real issue, so you can identify which customfield_xxxxx is:
 *   - Story Points
 *   - Sprint
 *   - POD / Team
 *
 * Also lists the distinct status names in use so you can pick which ones count
 * as "done" (JIRA_DONE_STATUSES).
 *
 * Environment resolution order:
 *   1. process.env   (lets you override without editing files)
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
const ISSUE_TYPE = pick("JIRA_DISCOVERY_ISSUE_TYPE");

if (!HOST || !EMAIL || !TOKEN) {
  console.error(
    "Missing JIRA_HOST / JIRA_EMAIL / JIRA_API_TOKEN.\n" +
      "Set them in .env.local or as environment variables."
  );
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
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GET ${path} -> ${res.status} ${res.statusText}\n${body.slice(0, 300)}`);
  }
  return res.json();
}

async function jiraPost(path, body) {
  const res = await fetch(`${HOST}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const body2 = await res.text().catch(() => "");
    throw new Error(`POST ${path} -> ${res.status} ${res.statusText}\n${body2.slice(0, 300)}`);
  }
  return res.json();
}

function describe(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value
      .map((v) =>
        v && typeof v === "object" ? v.name || v.value || JSON.stringify(v) : String(v)
      )
      .join(", ")
      .slice(0, 90);
  }
  if (typeof value === "object") {
    return (value.name || value.value || value.key || JSON.stringify(value))
      .toString()
      .slice(0, 90);
  }
  return String(value).slice(0, 90);
}

async function main() {
  console.log(`Host: ${HOST}`);
  console.log(`JQL:  ${JQL}\n`);

  // 1. Auth preflight - /myself returns 401 on a bad or truncated token.
  //    /rest/api/3/field does NOT - it silently serves the public field list.
  console.log("Checking authentication...");
  let me;
  try {
    me = await jiraGet("/rest/api/3/myself");
    console.log(`Authenticated as: ${me.emailAddress || me.displayName || me.accountId}\n`);
  } catch (err) {
    console.error("\n*** AUTH FAILED ***");
    console.error(err.message);
    console.error(
      "\nThe token is not valid for this host. Check:\n" +
        "  - JIRA_HOST points at the right site\n" +
        "  - the token is complete (no truncation when copy/pasted)\n" +
        "  - the account has access to this Jira site\n" +
        "  - the token is still active at https://id.atlassian.com/manage-profile/security/api-tokens"
    );
    process.exit(1);
  }

  // 2. Fetch sample issues
  const jql = ISSUE_TYPE ? `${JQL} AND issuetype = "${ISSUE_TYPE}"` : `${JQL} ORDER BY updated DESC`;
  let sample = null;
  let statusCounts = {};
  try {
    const search = await jiraPost("/rest/api/3/search/jql", {
      jql,
      maxResults: 50,
      fields: ["*all"],
    });
    const issues = search.issues || [];
    for (const i of issues) {
      const name = i.fields?.status?.name;
      if (name) statusCounts[name] = (statusCounts[name] || 0) + 1;
    }
    // Prefer a Story with real values as the sample
    sample =
      issues.find(
        (i) =>
          i.fields?.issuetype?.name === "Story" &&
          i.fields?.customfield_10078 != null
      ) ||
      issues.find((i) => i.fields?.issuetype?.name === "Story") ||
      issues[0] ||
      null;
    if (!sample) {
      console.warn("No issues found for this JQL. Field list will show names only.");
    }
  } catch (err) {
    console.warn("Issue search failed:", err.message);
  }

  // 3. List fields
  const fields = await jiraGet("/rest/api/3/field");
  const custom = fields.filter((f) => f.custom);

  if (custom.length === 0) {
    console.error(
      "\n*** 0 custom fields returned ***\n" +
        "This usually means the token is not authenticating for this host."
    );
    process.exit(1);
  }

  console.log(`=== ${custom.length} custom fields ===\n`);
  console.log("(fields with a value on the sample issue are shown after the pipe)\n");

  const populated = [];
  for (const f of custom) {
    const sampleVal = sample?.fields?.[f.id];
    const shown = describe(sampleVal);
    if (shown) populated.push(f);
    console.log(`${f.id.padEnd(20)} ${String(f.name).padEnd(40)} ${shown ? `| ${shown}` : ""}`);
  }

  // 4. Status names - needed to pick JIRA_DONE_STATUSES
  console.log("\n=== STATUS NAMES IN USE (pick the 'done' ones) ===");
  const sorted = Object.entries(statusCounts).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) {
    console.log("(none - no issues found)");
  }
  for (const [s, c] of sorted) {
    console.log(`  ${String(c).padStart(4)}  ${s}`);
  }

  if (sample) {
    console.log("\n=== Sample issue ===");
    console.log(`Key:    ${sample.key}`);
    console.log(`Type:   ${sample.fields.issuetype?.name}`);
    console.log(`Status: ${sample.fields.status?.name}`);
    console.log(`Assign: ${sample.fields.assignee?.displayName || "Unassigned"}`);
    console.log(`Parent: ${sample.fields.parent?.key || "none"}`);
    console.log(`Project:${sample.fields.project?.key}`);
  }

  console.log(`
Next steps:
1. Story Points  -> the field whose value is a number like 3, 5, 8
2. Sprint        -> the field whose value looks like a sprint name
3. POD / Team    -> the field whose value matches your team name
4. Add to .env.local:
     JIRA_STORY_POINTS_FIELD=customfield_XXXXX
     JIRA_SPRINT_FIELD=customfield_XXXXX
     JIRA_POD_FIELD=customfield_XXXXX
     JIRA_DONE_STATUSES=Done,Accepted,Released
`);
}

main().catch((err) => {
  console.error("Discovery failed:", err.message);
  process.exit(1);
});

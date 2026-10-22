/**
 * Sync worker - queue consumer.
 * Processes paginated, retryable sync work: issue fetch, changelog, fact rebuild.
 * Runs with api.asApp() for privileged synchronization.
 */
import api from "@forge/api";
import { JiraClient } from "../api/jiraClient";
import { query, execute } from "../storage/db";
import { getProjectScope } from "../config/configRepository";
import { getFieldMapping } from "../config/configRepository";

const CALC_VERSION = "1.0.0";

export async function handler(event: any) {
  const { issueKey, projectKey, fullRebuild = false } = (event.payload || {}) as Record<string, string | boolean>;
  console.log("[sync-worker] Processing", { issueKey, projectKey, fullRebuild });

  const client = new JiraClient({ asApp: true });

  try {
    const projects = await getProjectScope();
    const projectKeys = projects.map((p) => p.project_key);

    const cursor = await getCursor();
    const jql = fullRebuild
      ? `project in (${projectKeys.join(", ")})`
      : `project in (${projectKeys.join(", ")}) AND updated >= '${cursor}' ORDER BY updated ASC, id ASC`;

    const fields = await getRequiredFields();

    const issues = await client.searchIssuesJql(jql, fields, 100, true);

    let recordsRead = 0;
    let recordsWritten = 0;

    for (const issue of issues) {
      recordsRead++;
      await upsertIssue(issue, client);
      recordsWritten++;

      try {
        const changelog = await client.getChangelog(String(issue.id), true);
        await upsertChangelog(issue.id, changelog);
      } catch (err) {
        console.warn(`[sync-worker] Changelog fetch failed for ${issue.key}`, err);
      }
    }

    await setCursor(new Date().toISOString());

    return {
      status: "success",
      records_read: recordsRead,
      records_written: recordsWritten,
      issues: issues.length,
    };
  } catch (err) {
    console.error("[sync-worker] Sync failed", err);
    return { status: "failed", error: String(err) };
  }
}

async function getCursor(): Promise<string> {
  const result = await query(`SELECT config_value FROM app_config WHERE config_key = 'sync_cursor'`);
  const row = (result.rows || [])[0];
  return row ? String(row.config_value) : "2020-01-01T00:00:00.000Z";
}

async function setCursor(value: string): Promise<void> {
  await execute(
    `INSERT INTO app_config (config_key, config_value, updated_at)
     VALUES ('sync_cursor', ?, ?)
     ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), updated_at = VALUES(updated_at)`,
    value,
    new Date().toISOString()
  );
}

async function getRequiredFields(): Promise<string[]> {
  const fields = [
    "summary", "status", "issuetype", "project", "parent", "assignee",
    "priority", "created", "updated", "resolutiondate", "duedate",
    "labels", "components", "fixVersions",
  ];

  const podField = await getFieldMapping("podFieldId");
  const spField = await getFieldMapping("storyPointsFieldId");
  const piField = await getFieldMapping("programIncrementFieldId");

  if (podField) fields.push(podField);
  if (spField) fields.push(spField);
  if (piField) fields.push(piField);

  return [...new Set(fields)];
}

async function upsertIssue(issue: any, client: JiraClient): Promise<void> {
  const fields = issue.fields || {};
  const project = fields.project || {};
  const issuetype = fields.issuetype || {};
  const status = fields.status || {};
  const assignee = fields.assignee;
  const priority = fields.priority;
  const parent = fields.parent;

  const podField = await getFieldMapping("podFieldId");
  const spField = await getFieldMapping("storyPointsFieldId");
  const piField = await getFieldMapping("programIncrementFieldId");

  const podValue = fields[podField] || null;
  const spValue = fields[spField] || 0;
  const piValue = fields[piField] || null;

  const storyPoints = typeof spValue === "number" ? spValue : parseFloat(String(spValue)) || 0;

  const sourceHash = await hashIssue(issue);

  await execute(
    `INSERT INTO jira_issue_current
      (issue_id, issue_key, project_id, project_key, issue_type_id, issue_type_name,
       summary, parent_issue_id, parent_key, status_id, status_name, status_category,
       pod_id, program_increment, story_points, assignee_account_id, assignee_display_name,
       created_at, updated_at, resolved_at, due_date, source_hash, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE)
     ON DUPLICATE KEY UPDATE
       project_id = VALUES(project_id),
       project_key = VALUES(project_key),
       issue_type_id = VALUES(issue_type_id),
       issue_type_name = VALUES(issue_type_name),
       summary = VALUES(summary),
       parent_issue_id = VALUES(parent_issue_id),
       parent_key = VALUES(parent_key),
       status_id = VALUES(status_id),
       status_name = VALUES(status_name),
       status_category = VALUES(status_category),
       pod_id = VALUES(pod_id),
       program_increment = VALUES(program_increment),
       story_points = VALUES(story_points),
       assignee_account_id = VALUES(assignee_account_id),
       assignee_display_name = VALUES(assignee_display_name),
       updated_at = VALUES(updated_at),
       resolved_at = VALUES(resolved_at),
       due_date = VALUES(due_date),
       source_hash = VALUES(source_hash),
       deleted = FALSE`,
    issue.id,
    issue.key,
    project.id || null,
    project.key || null,
    issuetype.id || null,
    issuetype.name || null,
    fields.summary || null,
    parent ? parent.id : null,
    parent ? parent.key : null,
    status.id || null,
    status.name || null,
    status.statusCategory?.name || null,
    podValue ? String(podValue) : null,
    piValue ? String(piValue) : null,
    storyPoints,
    assignee?.accountId || null,
    assignee?.displayName || null,
    fields.created || null,
    fields.updated || null,
    fields.resolutiondate || null,
    fields.duedate || null,
    sourceHash
  );
}

async function upsertChangelog(issueId: number | string, histories: any[]): Promise<void> {
  for (const h of histories || []) {
    for (const item of h.items || []) {
      await execute(
        `INSERT INTO issue_field_event
          (event_id, issue_id, field_id, field_name, from_value, from_display, to_value, to_display, changed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           field_name = VALUES(field_name),
           from_value = VALUES(from_value),
           to_value = VALUES(to_value),
           changed_at = VALUES(changed_at)`,
        item.fieldId || h.id,
        issueId,
        item.field || null,
        item.field || null,
        item.fromString || null,
        item.fromDisplay || null,
        item.toString || null,
        item.toDisplay || null,
        h.created || null
      );
    }
  }
}

async function hashIssue(issue: any): Promise<string> {
  const str = JSON.stringify({
    key: issue.key,
    summary: issue.fields?.summary,
    status: issue.fields?.status?.name,
    updated: issue.fields?.updated,
    storypoints: issue.fields?.customfield_10031 || issue.fields?.customfield_10016,
  });
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(16).padStart(16, "0");
}

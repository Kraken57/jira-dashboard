/**
 * Done-by-sprint-close and completion model.
 * Uses status IDs / status category + explicit admin overrides.
 * Never hard-codes Done labels as universal behavior.
 */
import { query } from "../storage/db";

export interface DoneStatusConfig {
  doneStatusIds: string[];
  excludedStoryStatusIds: string[];
  excludeChildrenOfBlockedFeature: boolean;
}

const DEFAULT_DONE: DoneStatusConfig = {
  doneStatusIds: [],
  excludedStoryStatusIds: [],
  excludeChildrenOfBlockedFeature: false,
};

export async function getDoneStatusConfig(): Promise<DoneStatusConfig> {
  const doneResult = await query(
    `SELECT config_value FROM app_config WHERE config_key = 'done_status_ids'`
  );
  const doneRow = (doneResult.rows || [])[0];

  const exclResult = await query(
    `SELECT config_value FROM app_config WHERE config_key = 'excluded_story_status_ids'`
  );
  const exclRow = (exclResult.rows || [])[0];

  const childResult = await query(
    `SELECT config_value FROM app_config WHERE config_key = 'exclude_children_of_blocked_feature'`
  );
  const childRow = (childResult.rows || [])[0];

  return {
    doneStatusIds: doneRow?.config_value ? String(doneRow.config_value).split(",").filter(Boolean) : [],
    excludedStoryStatusIds: exclRow?.config_value ? String(exclRow.config_value).split(",").filter(Boolean) : [],
    excludeChildrenOfBlockedFeature: childRow?.config_value === "true",
  };
}

export interface IssueStatusAt {
  issueId: number;
  statusId: string;
  statusName: string;
  statusCategory: string;
  changedAt: string;
}

export async function getStatusAtTime(
  issueId: number,
  atTime: string
): Promise<IssueStatusAt | null> {
  const result = await query(
    `SELECT e.issue_id, e.to_value AS status_id, e.to_display AS status_name,
           e.changed_at, i.status_name AS current_status_name, i.status_category AS current_status_category,
           i.status_id AS current_status_id
     FROM issue_field_event e
     LEFT JOIN jira_issue_current i ON i.issue_id = e.issue_id
     WHERE e.issue_id = ?
       AND e.field_id = 'status'
       AND e.changed_at <= ?
     ORDER BY e.changed_at DESC
     LIMIT 1`,
    issueId,
    atTime
  );
  const rows = result.rows || [];
  if (rows.length > 0) {
    const r = rows[0] as any;
    return {
      issueId: r.issue_id,
      statusId: r.status_id,
      statusName: r.status_name,
      statusCategory: r.status_category,
      changedAt: r.changed_at,
    };
  }

  const cur = await query(
    `SELECT issue_id, status_id, status_name, status_category, updated_at
     FROM jira_issue_current WHERE issue_id = ?`,
    issueId
  );
  const curRows = cur.rows || [];
  if (curRows.length > 0) {
    const r = curRows[0] as any;
    return {
      issueId: r.issue_id,
      statusId: r.status_id,
      statusName: r.status_name,
      statusCategory: r.status_category,
      changedAt: r.updated_at,
    };
  }

  return null;
}

export function isDoneStatus(statusId: string, config: DoneStatusConfig): boolean {
  return config.doneStatusIds.includes(statusId);
}

export function isExcludedStoryStatus(statusId: string, config: DoneStatusConfig): boolean {
  return config.excludedStoryStatusIds.includes(statusId);
}

export interface CompletionResult {
  doneBySprintClose: boolean;
  doneAt: string | null;
  anomalyDoneBeforeStart: boolean;
}

export async function computeDoneBySprintClose(
  issueId: number,
  sprintEndAt: string | null,
  config: DoneStatusConfig
): Promise<CompletionResult> {
  if (!sprintEndAt) {
    return { doneBySprintClose: false, doneAt: null, anomalyDoneBeforeStart: false };
  }

  const statusAtClose = await getStatusAtTime(issueId, sprintEndAt);
  if (!statusAtClose) {
    return { doneBySprintClose: false, doneAt: null, anomalyDoneBeforeStart: false };
  }

  const done = isDoneStatus(statusAtClose.statusId, config);
  const doneAt = done ? statusAtClose.changedAt : null;

  return { doneBySprintClose: done, doneAt, anomalyDoneBeforeStart: false };
}

export { DEFAULT_DONE };

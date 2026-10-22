/**
 * Configuration repository using Forge storage (SQL-backed app_config table).
 * Stores field mappings, status mappings, issue-type mappings, POD mapping,
 * canonical timebox mapping, commitment grace period, etc.
 */
import { query, execute } from "../storage/db";

export interface AppConfig {
  [key: string]: string;
}

export async function getConfig(key: string): Promise<string | null> {
  const result = await query(
    `SELECT config_value FROM app_config WHERE config_key = ?`,
    key
  );
  const row = (result.rows || [])[0];
  return row ? String(row.config_value) : null;
}

export async function setConfig(key: string, value: string): Promise<void> {
  await execute(
    `INSERT INTO app_config (config_key, config_value, updated_at)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       config_value = VALUES(config_value),
       updated_at = VALUES(updated_at)`,
    key,
    value,
    new Date().toISOString()
  );
}

export async function getAllConfig(): Promise<AppConfig> {
  const result = await query(`SELECT config_key, config_value FROM app_config`);
  const config: AppConfig = {};
  for (const row of result.rows || []) {
    config[String(row.config_key)] = String(row.config_value);
  }
  return config;
}

export async function getFieldMapping(logicalField: string): Promise<string | null> {
  const result = await query(
    `SELECT jira_field_id FROM field_mapping WHERE logical_field = ?`,
    logicalField
  );
  const row = (result.rows || [])[0];
  return row ? String(row.jira_field_id) : null;
}

export async function setFieldMapping(
  logicalField: string,
  jiraFieldId: string,
  jiraFieldName: string,
  fieldType: string
): Promise<void> {
  await execute(
    `INSERT INTO field_mapping (logical_field, jira_field_id, jira_field_name, field_type, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       jira_field_id = VALUES(jira_field_id),
       jira_field_name = VALUES(jira_field_name),
       field_type = VALUES(field_type),
       updated_at = VALUES(updated_at)`,
    logicalField,
    jiraFieldId,
    jiraFieldName,
    fieldType,
    new Date().toISOString()
  );
}

export async function getAllFieldMappings(): Promise<Record<string, { jira_field_id: string; jira_field_name: string; field_type: string }>> {
  const result = await query(`SELECT logical_field, jira_field_id, jira_field_name, field_type FROM field_mapping`);
  const map: Record<string, { jira_field_id: string; jira_field_name: string; field_type: string }> = {};
  for (const row of result.rows || []) {
    map[String(row.logical_field)] = {
      jira_field_id: String(row.jira_field_id),
      jira_field_name: String(row.jira_field_name),
      field_type: String(row.field_type),
    };
  }
  return map;
}

export async function getStatusMappings(): Promise<Array<{
  status_id: string;
  status_name: string;
  status_category: string;
  is_done: boolean;
  is_excluded: boolean;
}>> {
  const result = await query(`SELECT status_id, status_name, status_category, is_done, is_excluded FROM status_mapping`);
  return (result.rows || []) as any[];
}

export async function setStatusMapping(
  statusId: string,
  statusName: string,
  statusCategory: string,
  isDone: boolean,
  isExcluded: boolean
): Promise<void> {
  await execute(
    `INSERT INTO status_mapping (status_id, status_name, status_category, is_done, is_excluded, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       status_name = VALUES(status_name),
       status_category = VALUES(status_category),
       is_done = VALUES(is_done),
       is_excluded = VALUES(is_excluded),
       updated_at = VALUES(updated_at)`,
    statusId,
    statusName,
    statusCategory,
    isDone,
    isExcluded,
    new Date().toISOString()
  );
}

export async function getIssueTypeMappings(): Promise<Array<{
  issue_type_id: string;
  issue_type_name: string;
  is_measured_delivery: boolean;
  is_feature: boolean;
  is_defect: boolean;
  is_subtask: boolean;
}>> {
  const result = await query(`SELECT * FROM issue_type_mapping`);
  return (result.rows || []) as any[];
}

export async function setIssueTypeMapping(
  issueTypeId: string,
  issueTypeName: string,
  isMeasuredDelivery: boolean,
  isFeature: boolean,
  isDefect: boolean,
  isSubtask: boolean
): Promise<void> {
  await execute(
    `INSERT INTO issue_type_mapping (issue_type_id, issue_type_name, is_measured_delivery, is_feature, is_defect, is_subtask, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       issue_type_name = VALUES(issue_type_name),
       is_measured_delivery = VALUES(is_measured_delivery),
       is_feature = VALUES(is_feature),
       is_defect = VALUES(is_defect),
       is_subtask = VALUES(is_subtask),
       updated_at = VALUES(updated_at)`,
    issueTypeId,
    issueTypeName,
    isMeasuredDelivery,
    isFeature,
    isDefect,
    isSubtask,
    new Date().toISOString()
  );
}

export async function getProjectScope(): Promise<Array<{
  project_id: number;
  project_key: string;
  project_name: string;
  enabled: boolean;
}>> {
  const result = await query(`SELECT * FROM project_scope WHERE enabled = TRUE`);
  return (result.rows || []) as any[];
}

export async function setProjectScope(
  projectId: number,
  projectKey: string,
  projectName: string,
  enabled: boolean
): Promise<void> {
  await execute(
    `INSERT INTO project_scope (project_id, project_key, project_name, enabled, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       project_key = VALUES(project_key),
       project_name = VALUES(project_name),
       enabled = VALUES(enabled),
       updated_at = VALUES(updated_at)`,
    projectId,
    projectKey,
    projectName,
    enabled,
    new Date().toISOString()
  );
}

export async function getPods(): Promise<Array<{ pod_id: string; pod_name: string; active: boolean }>> {
  const result = await query(`SELECT * FROM pod_dimension WHERE active = TRUE`);
  return (result.rows || []) as any[];
}

export async function setPod(podId: string, podName: string, active: boolean): Promise<void> {
  await execute(
    `INSERT INTO pod_dimension (pod_id, pod_name, active, updated_at)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       pod_name = VALUES(pod_name),
       active = VALUES(active),
       updated_at = VALUES(updated_at)`,
    podId,
    podName,
    active,
    new Date().toISOString()
  );
}

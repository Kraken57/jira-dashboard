/**
 * Commitment snapshot logic.
 * For every source sprint mapped to an enterprise timebox, capture issues present
 * at commitment_at = sprint_start_at + planning_grace_hours (default 48h).
 * snapshot_source: OBSERVED | RECONSTRUCTED_FROM_CHANGELOG | APPROXIMATED | UNKNOWN
 */
import { query, execute } from "../storage/db";

export interface CommitmentSnapshotInput {
  jira_sprint_id: number;
  timebox_id: string;
  pod_id: string;
  issue_id: number;
  story_points: number;
  snapshot_at: string;
  snapshot_source: "OBSERVED" | "RECONSTRUCTED_FROM_CHANGELOG" | "APPROXIMATED" | "UNKNOWN";
}

export interface CommitmentConfig {
  planning_grace_hours: number;
}

const DEFAULT_CONFIG: CommitmentConfig = { planning_grace_hours: 48 };

export async function getCommitmentConfig(): Promise<CommitmentConfig> {
  const result = await query(
    `SELECT config_value FROM app_config WHERE config_key = 'planning_grace_hours'`
  );
  const row = (result.rows || [])[0];
  if (row && row.config_value) {
    return { planning_grace_hours: parseInt(String(row.config_value), 10) || 48 };
  }
  return DEFAULT_CONFIG;
}

export async function upsertCommitmentSnapshots(
  snapshots: CommitmentSnapshotInput[]
): Promise<void> {
  for (const s of snapshots) {
    await execute(
      `INSERT INTO sprint_commitment_snapshot
        (jira_sprint_id, timebox_id, pod_id, issue_id, story_points,
         snapshot_at, snapshot_source, calculation_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         timebox_id = VALUES(timebox_id),
         pod_id = VALUES(pod_id),
         story_points = VALUES(story_points),
         snapshot_at = VALUES(snapshot_at),
         snapshot_source = VALUES(snapshot_source),
         calculation_version = VALUES(calculation_version)`,
      s.jira_sprint_id,
      s.timebox_id,
      s.pod_id,
      s.issue_id,
      s.story_points,
      s.snapshot_at,
      s.snapshot_source,
      "1.0.0"
    );
  }
}

export async function getCommitmentSnapshots(
  jiraSprintId: number
): Promise<CommitmentSnapshotInput[]> {
  const result = await query(
    `SELECT jira_sprint_id, timebox_id, pod_id, issue_id, story_points,
           snapshot_at, snapshot_source
     FROM sprint_commitment_snapshot
     WHERE jira_sprint_id = ?`,
    jiraSprintId
  );
  return (result.rows || []) as unknown as CommitmentSnapshotInput[];
}

export function computeCommitmentAt(
  sprintStartAt: string | null,
  config: CommitmentConfig
): string {
  if (!sprintStartAt) return new Date().toISOString();
  const start = new Date(sprintStartAt);
  start.setHours(start.getHours() + config.planning_grace_hours);
  return start.toISOString();
}

export async function getAllCommitmentSnapshots(): Promise<CommitmentSnapshotInput[]> {
  const result = await query(
    `SELECT jira_sprint_id, timebox_id, pod_id, issue_id, story_points,
           snapshot_at, snapshot_source
     FROM sprint_commitment_snapshot`
  );
  return (result.rows || []) as unknown as CommitmentSnapshotInput[];
}

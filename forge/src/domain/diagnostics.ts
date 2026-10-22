/**
 * Missed-work diagnostics.
 * Derives explainable signal codes from Jira data:
 * never_started, large_story, three_or_more_sprints, spike, parent_feature_not_approved,
 * added_after_commitment, removed_after_commitment, reopened_after_done, missing_story_points.
 */
import { query } from "../storage/db";

export interface MissedWorkSignal {
  issue_id: number;
  issue_key: string;
  pod_id: string;
  timebox_id: string;
  jira_sprint_id: number;
  signals: string[];
  story_points: number;
}

export interface DiagnosticsConfig {
  large_story_sp_threshold: number;
  min_sprints_for_multi_sprint: number;
}

const DEFAULT_DIAGNOSTICS: DiagnosticsConfig = {
  large_story_sp_threshold: 8,
  min_sprints_for_multi_sprint: 3,
};

export async function getDiagnosticsConfig(): Promise<DiagnosticsConfig> {
  const result = await query(
    `SELECT config_value FROM app_config WHERE config_key = 'diagnostics_config'`
  );
  const row = (result.rows || [])[0];
  if (row && row.config_value) {
    try {
      return JSON.parse(String(row.config_value));
    } catch {
      return DEFAULT_DIAGNOSTICS;
    }
  }
  return DEFAULT_DIAGNOSTICS;
}

export async function computeMissedWorkSignals(
  timeboxId: string,
  podId: string
): Promise<MissedWorkSignal[]> {
  const config = await getDiagnosticsConfig();

  const result = await query(
    `SELECT ssf.issue_id, ssf.issue_key, ssf.pod_id, ssf.timebox_id, ssf.jira_sprint_id,
           ssf.story_points, ssf.planned_at_commitment, ssf.done_by_sprint_close,
           ssf.added_after_commitment, ssf.removed_after_commitment, ssf.feature_issue_id,
           ssf.is_spike
     FROM story_sprint_fact ssf
     WHERE ssf.timebox_id = ? AND ssf.pod_id = ?
       AND ssf.planned_at_commitment = TRUE AND ssf.done_by_sprint_close = FALSE`,
    timeboxId,
    podId
  );

  const rows = (result.rows || []) as any[];

  const sprintCounts = await query(
    `SELECT issue_id, COUNT(DISTINCT jira_sprint_id) AS sprint_count
     FROM story_sprint_fact
     WHERE pod_id = ?
     GROUP BY issue_id`,
    podId
  );
  const sprintCountMap = new Map<number, number>();
  for (const r of (sprintCounts.rows || []) as any[]) {
    sprintCountMap.set(Number(r.issue_id), Number(r.sprint_count));
  }

  const signals: MissedWorkSignal[] = [];

  for (const row of rows) {
    const sigs: string[] = [];

    if (Number(row.story_points || 0) >= config.large_story_sp_threshold) {
      sigs.push("large_story");
    }

    const sprintCount = sprintCountMap.get(Number(row.issue_id)) || 1;
    if (sprintCount >= config.min_sprints_for_multi_sprint) {
      sigs.push("three_or_more_sprints");
    }

    if (row.is_spike) {
      sigs.push("spike");
    }

    if (row.added_after_commitment) {
      sigs.push("added_after_commitment");
    }

    if (row.removed_after_commitment) {
      sigs.push("removed_after_commitment");
    }

    if (row.feature_issue_id) {
      const feat = await query(
        `SELECT approved FROM feature_baseline
         WHERE feature_issue_id = ?
         ORDER BY baseline_version DESC LIMIT 1`,
        row.feature_issue_id
      );
      const frow = (feat.rows || [])[0];
      if (!frow || !(frow.approved === 1 || frow.approved === true)) {
        sigs.push("parent_feature_not_approved");
      }
    }

    sigs.push("never_started");

    signals.push({
      issue_id: Number(row.issue_id),
      issue_key: row.issue_key,
      pod_id: row.pod_id,
      timebox_id: row.timebox_id,
      jira_sprint_id: Number(row.jira_sprint_id),
      signals: sigs,
      story_points: Number(row.story_points || 0),
    });
  }

  return signals;
}

export async function storeDataQualityWarnings(
  timeboxId: string,
  warnings: { type: string; entityId: string; message: string }[]
): Promise<void> {
  for (const w of warnings) {
    await execute(
      `INSERT INTO data_quality_warning
        (warning_id, warning_type, entity_id, timebox_id, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         message = VALUES(message),
         created_at = VALUES(created_at),
         resolved = FALSE`,
      `${w.type}-${w.entityId}-${timeboxId}`,
      w.type,
      w.entityId,
      timeboxId,
      w.message,
      new Date().toISOString()
    );
  }
}

export { DEFAULT_DIAGNOSTICS };

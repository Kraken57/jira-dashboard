/**
 * Core KPI calculation engine.
 * Pure calculations over story_sprint_fact rows.
 * Enterprise percentages computed from underlying totals (not average of POD %).
 */
import { query, execute } from "../storage/db";

export interface PodTimeboxKPI {
  timebox_id: string;
  pod_id: string;
  committed_sp: number;
  delivered_committed_sp: number;
  missed_committed_sp: number;
  total_delivered_sp: number;
  unplanned_delivered_sp: number;
  committed_story_count: number;
  missed_story_count: number;
  say_do_ratio: number | null;
  carryover_ratio: number | null;
  plan_load: number | null;
}

export interface EnterpriseKPI {
  timebox_id: string;
  enterprise_committed_sp: number;
  enterprise_delivered_committed_sp: number;
  enterprise_missed_committed_sp: number;
  enterprise_total_velocity: number;
  enterprise_unplanned_delivered_sp: number;
  enterprise_say_do: number | null;
  enterprise_carryover: number | null;
  enterprise_plan_load: number | null;
}

export interface RollingAverageVelocity {
  timebox_id: string;
  pod_id: string;
  average_velocity: number;
  window: number;
}

const CALC_VERSION = "1.0.0";

export async function calculatePodTimeboxKPI(
  timeboxId: string,
  podId: string
): Promise<PodTimeboxKPI> {
  const result = await query(
    `SELECT
      SUM(CASE WHEN planned_at_commitment THEN story_points ELSE 0 END) AS committed_sp,
      SUM(committed_delivered_sp) AS delivered_committed_sp,
      SUM(missed_committed_sp) AS missed_committed_sp,
      SUM(total_delivered_sp) AS total_delivered_sp,
      SUM(unplanned_delivered_sp) AS unplanned_delivered_sp,
      COUNT(*) AS committed_story_count,
      SUM(CASE WHEN planned_at_commitment AND NOT done_by_sprint_close THEN 1 ELSE 0 END) AS missed_story_count
     FROM story_sprint_fact
     WHERE timebox_id = ? AND pod_id = ?`,
    timeboxId,
    podId
  );

  const row = (result.rows || [])[0] as any;
  const committedSp = Number(row.committed_sp || 0);
  const deliveredCommittedSp = Number(row.delivered_committed_sp || 0);
  const missedCommittedSp = Number(row.missed_committed_sp || 0);
  const totalDeliveredSp = Number(row.total_delivered_sp || 0);
  const unplannedDeliveredSp = Number(row.unplanned_delivered_sp || 0);
  const committedStoryCount = Number(row.committed_story_count || 0);
  const missedStoryCount = Number(row.missed_story_count || 0);

  const sayDo = committedSp > 0 ? deliveredCommittedSp / committedSp : null;
  const carryover = committedSp > 0 ? missedCommittedSp / committedSp : null;
  const planLoad = totalDeliveredSp > 0 ? committedSp / totalDeliveredSp : null;

  const kpi: PodTimeboxKPI = {
    timebox_id: timeboxId,
    pod_id: podId,
    committed_sp: committedSp,
    delivered_committed_sp: deliveredCommittedSp,
    missed_committed_sp: missedCommittedSp,
    total_delivered_sp: totalDeliveredSp,
    unplanned_delivered_sp: unplannedDeliveredSp,
    committed_story_count: committedStoryCount,
    missed_story_count: missedStoryCount,
    say_do_ratio: sayDo,
    carryover_ratio: carryover,
    plan_load: planLoad,
  };

  await execute(
    `INSERT INTO pod_timebox_kpi
      (timebox_id, pod_id, committed_sp, delivered_committed_sp, missed_committed_sp,
       total_delivered_sp, unplanned_delivered_sp, committed_story_count, missed_story_count,
       say_do_ratio, carryover_ratio, plan_load, calculated_at, calculation_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       committed_sp = VALUES(committed_sp),
       delivered_committed_sp = VALUES(delivered_committed_sp),
       missed_committed_sp = VALUES(missed_committed_sp),
       total_delivered_sp = VALUES(total_delivered_sp),
       unplanned_delivered_sp = VALUES(unplanned_delivered_sp),
       committed_story_count = VALUES(committed_story_count),
       missed_story_count = VALUES(missed_story_count),
       say_do_ratio = VALUES(say_do_ratio),
       carryover_ratio = VALUES(carryover_ratio),
       plan_load = VALUES(plan_load),
       calculated_at = VALUES(calculated_at),
       calculation_version = VALUES(calculation_version)`,
    kpi.timebox_id,
    kpi.pod_id,
    kpi.committed_sp,
    kpi.delivered_committed_sp,
    kpi.missed_committed_sp,
    kpi.total_delivered_sp,
    kpi.unplanned_delivered_sp,
    kpi.committed_story_count,
    kpi.missed_story_count,
    kpi.say_do_ratio ?? null,
    kpi.carryover_ratio ?? null,
    kpi.plan_load ?? null,
    new Date().toISOString(),
    CALC_VERSION
  );

  return kpi;
}

export async function calculateEnterpriseKPI(timeboxId: string): Promise<EnterpriseKPI> {
  const result = await query(
    `SELECT
      SUM(committed_sp) AS enterprise_committed_sp,
      SUM(delivered_committed_sp) AS enterprise_delivered_committed_sp,
      SUM(missed_committed_sp) AS enterprise_missed_committed_sp,
      SUM(total_delivered_sp) AS enterprise_total_velocity,
      SUM(unplanned_delivered_sp) AS enterprise_unplanned_delivered_sp
     FROM pod_timebox_kpi
     WHERE timebox_id = ?`,
    timeboxId
  );

  const row = (result.rows || [])[0] as any;
  const committedSp = Number(row.enterprise_committed_sp || 0);
  const deliveredCommittedSp = Number(row.enterprise_delivered_committed_sp || 0);
  const missedCommittedSp = Number(row.enterprise_missed_committed_sp || 0);
  const totalVelocity = Number(row.enterprise_total_velocity || 0);
  const unplannedDeliveredSp = Number(row.enterprise_unplanned_delivered_sp || 0);

  const sayDo = committedSp > 0 ? deliveredCommittedSp / committedSp : null;
  const carryover = committedSp > 0 ? missedCommittedSp / committedSp : null;
  const planLoad = totalVelocity > 0 ? committedSp / totalVelocity : null;

  return {
    timebox_id: timeboxId,
    enterprise_committed_sp: committedSp,
    enterprise_delivered_committed_sp: deliveredCommittedSp,
    enterprise_missed_committed_sp: missedCommittedSp,
    enterprise_total_velocity: totalVelocity,
    enterprise_unplanned_delivered_sp: unplannedDeliveredSp,
    enterprise_say_do: sayDo,
    enterprise_carryover: carryover,
    enterprise_plan_load: planLoad,
  };
}

export async function calculateRollingAverageVelocity(
  podId: string,
  window: number = 4
): Promise<RollingAverageVelocity[]> {
  const result = await query(
    `SELECT ptk.timebox_id, ptk.total_delivered_sp AS velocity, ct.start_at
     FROM pod_timebox_kpi ptk
     JOIN canonical_timebox ct ON ct.timebox_id = ptk.timebox_id
     WHERE ptk.pod_id = ?
     ORDER BY ct.start_at ASC`,
    podId
  );

  const rows = (result.rows || []) as { timebox_id: string; velocity: number; start_at: string }[];
  const averages: RollingAverageVelocity[] = [];

  for (let i = 0; i < rows.length; i++) {
    const start = Math.max(0, i - window + 1);
    const windowRows = rows.slice(start, i + 1);
    const sum = windowRows.reduce((acc, r) => acc + Number(r.velocity || 0), 0);
    const avg = sum / windowRows.length;

    averages.push({
      timebox_id: rows[i].timebox_id,
      pod_id: podId,
      average_velocity: avg,
      window: windowRows.length,
    });
  }

  return averages;
}

export async function getPodTimeboxKPI(
  timeboxId: string,
  podId: string
): Promise<PodTimeboxKPI | null> {
  const result = await query(
    `SELECT * FROM pod_timebox_kpi WHERE timebox_id = ? AND pod_id = ?`,
    timeboxId,
    podId
  );
  const rows = result.rows || [];
  if (rows.length === 0) return null;
  return rows[0] as PodTimeboxKPI;
}

export async function getEnterpriseKPI(timeboxId: string): Promise<EnterpriseKPI | null> {
  return calculateEnterpriseKPI(timeboxId);
}

export { CALC_VERSION };

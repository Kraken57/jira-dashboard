/**
 * Canonical enterprise sprint mapping.
 * Maps different POD Jira sprint names to a shared enterprise timebox (e.g. 2026-PI3-S1).
 * Never renames or overwrites Jira sprints.
 */
import { query, execute } from "../storage/db";

export interface JiraSprint {
  jira_sprint_id: number;
  jira_board_id: number;
  sprint_name: string;
  sprint_state: string;
  start_at: string | null;
  end_at: string | null;
}

export interface CanonicalTimebox {
  timebox_id: string;
  program_increment: string;
  sequence_no: number;
  canonical_name: string;
  start_at: string;
  end_at: string;
  commitment_at: string;
  state: string;
}

export interface SprintMapping {
  jira_sprint_id: number;
  jira_sprint_name: string;
  jira_board_id: number;
  jira_start_at: string | null;
  jira_end_at: string | null;
  canonical_timebox_id: string | null;
  canonical_name: string | null;
  mapping_method: string;
  mapping_status: string;
}

const CALC_VERSION = "1.0.0";
const TZ_TOLERANCE_HOURS = 2;

function normDate(d: string | null): string | null {
  if (!d) return null;
  return new Date(d).toISOString().slice(0, 10);
}

function dateDiffHours(a: string | null, b: string | null): number {
  if (!a || !b) return Infinity;
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 36e5;
}

export async function getCanonicalTimeboxes(): Promise<CanonicalTimebox[]> {
  const result = await query(
    `SELECT timebox_id, program_increment, sequence_no, canonical_name,
           start_at, end_at, commitment_at, state
     FROM canonical_timebox
     ORDER BY program_increment, sequence_no`
  );
  return (result.rows || []) as unknown as CanonicalTimebox[];
}

export async function upsertCanonicalTimebox(t: CanonicalTimebox): Promise<void> {
  await execute(
    `INSERT INTO canonical_timebox
      (timebox_id, program_increment, sequence_no, canonical_name, start_at, end_at, commitment_at, state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       program_increment = VALUES(program_increment),
       sequence_no = VALUES(sequence_no),
       canonical_name = VALUES(canonical_name),
       start_at = VALUES(start_at),
       end_at = VALUES(end_at),
       commitment_at = VALUES(commitment_at),
       state = VALUES(state)`,
    t.timebox_id,
    t.program_increment,
    t.sequence_no,
    t.canonical_name,
    t.start_at,
    t.end_at,
    t.commitment_at,
    t.state
  );
}

export async function getSprintMappings(): Promise<SprintMapping[]> {
  const result = await query(
    `SELECT js.jira_sprint_id, js.sprint_name AS jira_sprint_name, js.jira_board_id,
           js.start_at AS jira_start_at, js.end_at AS jira_end_at,
           ct.timebox_id AS canonical_timebox_id, ct.canonical_name,
           js.mapping_method, js.mapping_status
     FROM jira_sprint js
     LEFT JOIN canonical_timebox ct ON js.timebox_id = ct.timebox_id`
  );
  return (result.rows || []) as unknown as SprintMapping[];
}

export async function upsertJiraSprint(
  s: JiraSprint & { timebox_id?: string | null; mapping_method?: string; mapping_status?: string }
): Promise<void> {
  await execute(
    `INSERT INTO jira_sprint
      (jira_sprint_id, jira_board_id, sprint_name, sprint_state, start_at, end_at,
       complete_at, goal, timebox_id, mapping_method, mapping_status, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       sprint_name = VALUES(sprint_name),
       sprint_state = VALUES(sprint_state),
       start_at = VALUES(start_at),
       end_at = VALUES(end_at),
       timebox_id = VALUES(timebox_id),
       mapping_method = VALUES(mapping_method),
       mapping_status = VALUES(mapping_status),
       updated_at = VALUES(updated_at)`,
    s.jira_sprint_id,
    s.jira_board_id,
    s.sprint_name,
    s.sprint_state,
    s.start_at,
    s.end_at,
    s.start_at,
    s.sprint_name || "",
    s.timebox_id || null,
    s.mapping_method || null,
    s.mapping_status || "unmapped",
    new Date().toISOString()
  );
}

function canonicalName(pi: string, seq: number): string {
  return `${pi}-S${seq}`;
}

export async function mapSprintsToTimeboxes(
  sprints: JiraSprint[],
  timeboxes: CanonicalTimebox[],
  adminOverrides: Map<number, string> = new Map()
): Promise<SprintMapping[]> {
  const mappings: SprintMapping[] = [];

  for (const s of sprints) {
    const override = adminOverrides.get(s.jira_sprint_id);
    if (override) {
      const tb = timeboxes.find((t) => t.timebox_id === override);
      mappings.push({
        jira_sprint_id: s.jira_sprint_id,
        jira_sprint_name: s.sprint_name,
        jira_board_id: s.jira_board_id,
        jira_start_at: s.start_at,
        jira_end_at: s.end_at,
        canonical_timebox_id: override,
        canonical_name: tb?.canonical_name || null,
        mapping_method: "admin_override",
        mapping_status: "mapped",
      });
      await upsertJiraSprint({ ...s, timebox_id: override, mapping_method: "admin_override", mapping_status: "mapped" });
      continue;
    }

    let matched: CanonicalTimebox | null = null;
    let method = "";

    for (const tb of timeboxes) {
      if (
        normDate(s.start_at) === normDate(tb.start_at) &&
        normDate(s.end_at) === normDate(tb.end_at)
      ) {
        matched = tb;
        method = "exact_date_match";
        break;
      }
    }

    if (!matched) {
      for (const tb of timeboxes) {
        const ds = dateDiffHours(s.start_at, tb.start_at);
        const de = dateDiffHours(s.end_at, tb.end_at);
        if (ds <= TZ_TOLERANCE_HOURS && de <= TZ_TOLERANCE_HOURS) {
          matched = tb;
          method = "tolerance_match";
          break;
        }
      }
    }

    if (!matched) {
      const piMatch = s.sprint_name.match(/PI\.?(\d)/i);
      const seqMatch = s.sprint_name.match(/Iteration\s*(\d)/i);
      if (piMatch && seqMatch) {
        const pi = `CY26 PI.${piMatch[1]}`;
        const seq = parseInt(seqMatch[1], 10);
        const tb = timeboxes.find(
          (t) => t.program_increment === pi && t.sequence_no === seq
        );
        if (tb && dateDiffHours(s.start_at, tb.start_at) <= TZ_TOLERANCE_HOURS) {
          matched = tb;
          method = "name_pattern";
        }
      }
    }

    if (matched) {
      mappings.push({
        jira_sprint_id: s.jira_sprint_id,
        jira_sprint_name: s.sprint_name,
        jira_board_id: s.jira_board_id,
        jira_start_at: s.start_at,
        jira_end_at: s.end_at,
        canonical_timebox_id: matched.timebox_id,
        canonical_name: matched.canonical_name,
        mapping_method: method,
        mapping_status: "mapped",
      });
      await upsertJiraSprint({
        ...s,
        timebox_id: matched.timebox_id,
        mapping_method: method,
        mapping_status: "mapped",
      });
    } else {
      mappings.push({
        jira_sprint_id: s.jira_sprint_id,
        jira_sprint_name: s.sprint_name,
        jira_board_id: s.jira_board_id,
        jira_start_at: s.start_at,
        jira_end_at: s.end_at,
        canonical_timebox_id: null,
        canonical_name: null,
        mapping_method: "none",
        mapping_status: "unmapped",
      });
      await upsertJiraSprint({
        ...s,
        timebox_id: null,
        mapping_method: "none",
        mapping_status: "unmapped",
      });
    }
  }

  return mappings;
}

export async function getSprintsForTimebox(timeboxId: string): Promise<number[]> {
  const result = await query(`SELECT jira_sprint_id FROM jira_sprint WHERE timebox_id = ?`, timeboxId);
  return ((result.rows || []) as { jira_sprint_id: number }[]).map((r) => r.jira_sprint_id);
}

export { CALC_VERSION };

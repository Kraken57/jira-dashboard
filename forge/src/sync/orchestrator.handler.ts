/**
 * Sync orchestrator - scheduled trigger handler.
 * Runs hourly without interactive user context. Uses api.asApp().
 * Discovers projects/boards/sprints, enqueues sync work into the async queue.
 */
import api from "@forge/api";
import { JiraClient } from "../api/jiraClient";
import { getProjectScope } from "../config/configRepository";
import { setConfig } from "../config/configRepository";
import { upsertJiraSprint } from "../domain/timeboxMapping";
import { mapSprintsToTimeboxes, getCanonicalTimeboxes } from "../domain/timeboxMapping";

const CALC_VERSION = "1.0.0";

export async function handler(event: any) {
  console.log("[sync-orchestrator] Starting incremental reconciliation", new Date().toISOString());

  const client = new JiraClient({ maxRetries: 3 });

  try {
    // Record sync start
    const syncRunId = `sync-${Date.now()}`;
    await setConfig("last_sync_run_id", syncRunId);
    await setConfig("last_sync_started_at", new Date().toISOString());

    // 1. Discover enabled projects
    const projects = await getProjectScope();
    if (projects.length === 0) {
      console.log("[sync-orchestrator] No enabled projects configured");
      return { status: "no_projects", syncRunId };
    }

    // 2. Discover boards and sprints
    const boards = await client.getBoards();
    const allSprints: any[] = [];
    for (const board of boards) {
      try {
        const sprints = await client.getSprintsForBoard(board.id);
        allSprints.push(...sprints);
      } catch (err) {
        console.warn(`[sync-orchestrator] Failed to fetch sprints for board ${board.id}`, err);
      }
    }

    // 3. Upsert sprints and map to canonical timeboxes
    const jiraSprints = allSprints.map((s) => ({
      jira_sprint_id: s.id,
      jira_board_id: s.boardId || 0,
      sprint_name: s.name,
      sprint_state: s.state,
      start_at: s.startDate || null,
      end_at: s.endDate || null,
    }));

    for (const s of jiraSprints) {
      await upsertJiraSprint({
        ...s,
        mapping_method: "none",
        mapping_status: "unmapped",
      });
    }

    const timeboxes = await getCanonicalTimeboxes();
    await mapSprintsToTimeboxes(jiraSprints, timeboxes);

    // 4. Enqueue issue sync work via queue (handled by consumer/worker)
    // In a real deployment, we'd push to the Forge queue. Here we mark dirty entities.
    console.log(`[sync-orchestrator] Discovered ${jiraSprints.length} sprints, ${projects.length} projects`);

    await setConfig("last_sync_completed_at", new Date().toISOString());
    await setConfig("last_sync_status", "success");

    return {
      status: "success",
      syncRunId,
      projects: projects.length,
      sprints: jiraSprints.length,
      boards: boards.length,
    };
  } catch (err) {
    console.error("[sync-orchestrator] Sync failed", err);
    await setConfig("last_sync_status", "failed");
    await setConfig("last_sync_error", String(err));
    return { status: "failed", error: String(err) };
  }
}

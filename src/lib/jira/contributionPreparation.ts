import type { ContributionStorySource, ContributionWorklogPage, JiraWorkItem } from "./types";

const canceled = (item: JiraWorkItem) => /^cancel{1,2}ed$/i.test(item.status.trim());

/** Receive the completion-filtered stories; never narrow a story's children by assignee/sprint. */
export function prepareContributionSources(
  stories: JiraWorkItem[],
  allItems: JiraWorkItem[],
  completion: (story: JiraWorkItem) => Omit<ContributionStorySource, "story" | "subtasks" | "missingSubtaskKeys" | "childListKnown">,
): ContributionStorySource[] {
  const items = new Map(allItems.map((item) => [item.key, item]));
  const children = new Map<string, JiraWorkItem[]>();
  for (const item of items.values()) {
    if (!/^sub-?task$/i.test(item.workType) || !item.parentKey || canceled(item)) continue;
    children.set(item.parentKey, [...(children.get(item.parentKey) || []), item]);
  }
  return [...new Map(stories.map((story) => [story.key, story])).values()]
    .filter((story) => /^story$/i.test(story.workType) && !canceled(story))
    .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))
    .map((story) => ({
      story,
      subtasks: (children.get(story.key) || []).sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true })),
      missingSubtaskKeys: [...new Set(story.subtaskKeys || [])].filter((key) => !items.has(key)),
      childListKnown: Array.isArray(story.subtaskKeys),
      ...completion(story),
    }));
}

/** Strictly preserve authors/dates from Jira; missing identity is never replaced by the assignee. */
export function normalizeContributionWorklogPage(issueKey: string, value: unknown): ContributionWorklogPage {
  const page = value as { startAt?: number; total?: number; worklogs?: unknown[] } | null;
  if (!page || !Array.isArray(page.worklogs) || !Number.isSafeInteger(page.total) || page.total! < 0
    || !Number.isSafeInteger(page.startAt) || page.startAt! < 0) {
    throw new Error("Jira returned an invalid worklog page");
  }
  const worklogs = page.worklogs.map((value) => {
    const row = value as { id?: string; author?: { accountId?: string; displayName?: string }; started?: string; timeSpentSeconds?: number };
    if (!row || typeof row.id !== "string" || !row.id || !Number.isFinite(row.timeSpentSeconds) || row.timeSpentSeconds! < 0) {
      throw new Error("Jira returned a worklog without a valid ID or duration");
    }
    return {
      id: row.id,
      authorAccountId: typeof row.author?.accountId === "string" && row.author.accountId ? row.author.accountId : null,
      authorName: typeof row.author?.displayName === "string" && row.author.displayName ? row.author.displayName : "Unknown worklog author",
      started: typeof row.started === "string" && Number.isFinite(Date.parse(row.started)) ? row.started : null,
      timeSpentSeconds: row.timeSpentSeconds!,
    };
  });
  if (page.startAt! + worklogs.length > page.total! || (!worklogs.length && page.startAt! < page.total!)) {
    throw new Error("Jira returned an incomplete worklog page");
  }
  return { issueKey, startAt: page.startAt!, total: page.total!, worklogs };
}

export function validateWorklogRequest(issueKey: unknown, startAt: unknown): asserts issueKey is string {
  if (typeof issueKey !== "string" || !/^[A-Z][A-Z0-9_]*-\d+$/i.test(issueKey)
    || typeof startAt !== "number" || !Number.isSafeInteger(startAt) || startAt < 0 || startAt > 10_000_000) {
    throw new Error("A valid Jira issue key and worklog offset are required");
  }
}

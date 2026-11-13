import type { ContributionWorklog, ContributionWorklogPage } from "./types";

/** All pages must succeed before an item's author totals are considered available. */
export async function loadContributionWorklogs(
  issueKey: string,
  fetchPage: (key: string, offset: number) => Promise<ContributionWorklogPage>,
  isActive = () => true,
): Promise<ContributionWorklog[]> {
  const rows = new Map<string, ContributionWorklog>();
  let offset = 0;
  let total: number | undefined;
  for (let pageCount = 0; pageCount < 1000 && isActive(); pageCount++) {
    const page = await fetchPage(issueKey, offset);
    if (page.issueKey !== issueKey || page.startAt !== offset || (total !== undefined && total !== page.total)) {
      throw new Error("Worklogs changed during loading. Please check them again.");
    }
    total = page.total;
    for (const row of page.worklogs) {
      if (rows.has(row.id)) throw new Error("Jira returned duplicate worklogs. Please check them again.");
      rows.set(row.id, row);
    }
    offset += page.worklogs.length;
    if (offset === total) return [...rows.values()];
    if (!page.worklogs.length || offset > total) throw new Error("Jira returned incomplete worklogs");
  }
  throw new Error(isActive() ? "Worklog pagination exceeded the safety limit" : "Worklog check stopped");
}

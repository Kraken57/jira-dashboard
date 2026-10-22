/**
 * Jira API client for Forge backend.
 * Uses api.asApp() for privileged, read-only Jira access.
 * No user context needed. Credentials live in Forge environment variables.
 */
import api, { route } from "@forge/api";

export interface JiraClientOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

export class JiraClient {
  private maxRetries: number;
  private baseDelayMs: number;

  constructor(opts: JiraClientOptions = {}) {
    this.maxRetries = opts.maxRetries ?? 5;
    this.baseDelayMs = opts.baseDelayMs ?? 500;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  /**
   * Make a Jira REST API request with retries and backoff.
   * Uses api.asApp() - no user context, app-level permissions.
   */
  async requestJira(
    path: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<Response> {
    const caller = api.asApp();
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await caller.requestJira(route`${path.raw[0]}`);

        if (response.status === 429 || response.status === 503) {
          const retryAfter = response.headers.get("retry-after");
          const delay = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : this.baseDelayMs * 2 ** attempt;
          await this.sleep(delay);
          lastError = new Error(`Rate limited ${response.status}`);
          continue;
        }

        return response;
      } catch (err) {
        lastError = err;
        if (attempt < this.maxRetries) {
          await this.sleep(this.baseDelayMs * 2 ** attempt);
        }
      }
    }

    throw lastError;
  }

  /**
   * Paginated JQL search. Continues until no nextPageToken.
   */
  async searchIssuesJql(
    jql: string,
    fields: string[],
    maxResults = 100
  ): Promise<any[]> {
    const allIssues: any[] = [];
    let nextPageToken: string | undefined = undefined;

    while (true) {
      const body: any = { jql, maxResults, fields };
      if (nextPageToken) body.nextPageToken = nextPageToken;

      const response = await api.asApp().requestJira(route`/rest/api/3/search/jql`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Jira search failed: ${response.status} ${response.statusText}`);
      }

      const json = await response.json();
      const issues = json.issues || [];
      allIssues.push(...issues);

      nextPageToken = json.nextPageToken;
      if (!nextPageToken) break;
    }

    return allIssues;
  }

  async getIssue(issueKeyOrId: string): Promise<any> {
    const response = await api.asApp().requestJira(
      route`/rest/api/3/issue/${issueKeyOrId}?fields=summary,status,issuetype,project,parent,assignee,priority,created,updated,resolutiondate,duedate,labels,components,fixVersions`
    );
    if (!response.ok) {
      throw new Error(`Get issue failed: ${response.status}`);
    }
    return response.json();
  }

  async getChangelog(issueId: string): Promise<any[]> {
    const allHistories: any[] = [];
    let startAt = 0;
    const maxResults = 100;

    while (true) {
      const response = await api.asApp().requestJira(
        route`/rest/api/3/issue/${issueId}/changelog?startAt=${startAt}&maxResults=${maxResults}`
      );
      if (!response.ok) break;
      const json = await response.json();
      const histories = json.histories || [];
      allHistories.push(...histories);
      if (json.isLast) break;
      startAt += maxResults;
    }

    return allHistories;
  }

  async getSprintsForBoard(boardId: number): Promise<any[]> {
    const allSprints: any[] = [];
    let startAt = 0;
    const maxResults = 50;

    while (true) {
      const response = await api.asApp().requestJira(
        route`/rest/agile/1.0/board/${boardId}/sprint?startAt=${startAt}&maxResults=${maxResults}`
      );
      if (!response.ok) break;
      const json = await response.json();
      const sprints = json.values || [];
      allSprints.push(...sprints);
      if (json.isLast) break;
      startAt += maxResults;
    }

    return allSprints;
  }

  async getBoards(): Promise<any[]> {
    const response = await api.asApp().requestJira(route`/rest/agile/1.0/board`);
    if (!response.ok) return [];
    const json = await response.json();
    return json.values || [];
  }

  async getFields(): Promise<any[]> {
    const response = await api.asApp().requestJira(route`/rest/api/3/field`);
    if (!response.ok) return [];
    return response.json();
  }

  async getProjects(): Promise<any[]> {
    const response = await api.asApp().requestJira(route`/rest/api/3/project`);
    if (!response.ok) return [];
    return response.json();
  }

  async getIssueTypes(): Promise<any[]> {
    const response = await api.asApp().requestJira(route`/rest/api/3/issuetype`);
    if (!response.ok) return [];
    return response.json();
  }

  async getStatuses(): Promise<any[]> {
    const response = await api.asApp().requestJira(route`/rest/api/3/status`);
    if (!response.ok) return [];
    return response.json();
  }
}

export { JiraClient };

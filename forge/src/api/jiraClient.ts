/**
 * Jira API client for Forge backend.
 * Uses api.asApp() for privileged, read-only Jira access.
 * No user context needed. Credentials live in Forge environment variables.
 */
import api, { route } from "@forge/api";

function projectKeysFromJql(jql: string): string[] {
  const inMatch = jql.match(/\bproject\s+in\s*\(([^)]+)\)/i);
  const singleMatch = jql.match(/\bproject\s*=\s*([A-Z][A-Z0-9_]*)/i);
  const source = inMatch?.[1] ?? singleMatch?.[1] ?? "";
  return Array.from(new Set(source.split(",")
    .map((key) => key.trim().replace(/^['"]|['"]$/g, ""))
    .filter((key) => /^[A-Z][A-Z0-9_]*$/i.test(key))));
}

function safeJiraErrorSummary(body: string): { messages: string[]; errorFields: string[] } {
  try {
    const json = JSON.parse(body) as { errorMessages?: unknown; errors?: Record<string, unknown> };
    return {
      messages: Array.isArray(json.errorMessages)
        ? json.errorMessages.filter((item): item is string => typeof item === "string").slice(0, 3).map((item) => item.slice(0, 240))
        : [],
      errorFields: json.errors && typeof json.errors === "object" ? Object.keys(json.errors).slice(0, 20) : [],
    };
  } catch {
    return { messages: [], errorFields: [] };
  }
}

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
  ): Promise<any> {
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
    const startedAt = Date.now();
    const requestedProjectKeys = projectKeysFromJql(jql);
    const allIssues: any[] = [];
    let nextPageToken: string | undefined = undefined;
    let pageCount = 0;
    console.info("[JIRA_FETCH] Forge search started", {
      jqlLength: jql.length,
      containsCurrentUser: /\bcurrentUser\s*\(/i.test(jql),
      fieldsCount: fields.length,
      maxResults,
    });

    while (true) {
      pageCount++;
      const body: any = { jql, maxResults, fields };
      if (nextPageToken) body.nextPageToken = nextPageToken;

      const response = await api.asApp().requestJira(route`/rest/api/3/search/jql`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error("[JIRA_FETCH] Forge search failed", {
          statusCode: response.status,
          statusText: response.statusText,
          page: pageCount,
          requestedProjectKeys,
          ...safeJiraErrorSummary(errorBody),
        });
        throw new Error(`Jira search failed: ${response.status} ${response.statusText}`);
      }

      const json = await response.json();
      const issues = json.issues || [];
      allIssues.push(...issues);
      console.info("[JIRA_FETCH] Forge search page completed", {
        statusCode: response.status,
        page: pageCount,
        issuesInPage: issues.length,
        requestedProjectKeys,
      });

      nextPageToken = json.nextPageToken;
      if (!nextPageToken) break;
    }

    console.info("[JIRA_FETCH] Forge search completed", {
      issueCount: allIssues.length,
      projectKeysReturned: Array.from(new Set(allIssues
        .map((issue) => issue?.fields?.project?.key)
        .filter((key): key is string => typeof key === "string"))),
      pageCount,
      durationMs: Date.now() - startedAt,
    });

    if (allIssues.length === 0 && requestedProjectKeys.length > 0) {
      const projectChecks = await Promise.all(requestedProjectKeys.map(async (projectKey) => {
        try {
          const response = await api.asApp().requestJira(route`/rest/api/3/project/${projectKey}`);
          return { projectKey, statusCode: response.status, visibleToApp: response.ok };
        } catch (error) {
          return {
            projectKey,
            statusCode: null,
            visibleToApp: false,
            errorType: error instanceof Error ? error.name : "UnknownError",
          };
        }
      }));
      console.warn("[JIRA_ACCESS_DIAGNOSTIC] Zero-result project visibility check", {
        requestedProjectKeys,
        projectChecks,
        note: "A 200 project response confirms project visibility, but issue security or JQL filters can still hide issues.",
      });
    }
    return allIssues;
  }

  async getIssue(issueKeyOrId: string, fields?: string[]): Promise<any> {
    const requestedFields = fields?.length
      ? fields.join(",")
      : "summary,status,issuetype,project,parent,assignee,priority,created,updated,resolutiondate,duedate,labels,components,fixVersions";
    const response = await api.asApp().requestJira(
      route`/rest/api/3/issue/${issueKeyOrId}?fields=${requestedFields}`
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

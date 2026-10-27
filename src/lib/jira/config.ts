export const JIRA_CONFIG = {
  host: (process.env.JIRA_HOST || "").trim().replace(/\/+$/, ""),
  email: (process.env.JIRA_EMAIL || "").trim(),
  apiToken: (process.env.JIRA_API_TOKEN || "").trim(),
};

export function missingJiraConfig(): string[] {
  return [
    !JIRA_CONFIG.host && "JIRA_HOST",
    !JIRA_CONFIG.email && "JIRA_EMAIL",
    !JIRA_CONFIG.apiToken && "JIRA_API_TOKEN",
  ].filter(Boolean) as string[];
}

export function isJiraConfigured(): boolean {
  return missingJiraConfig().length === 0;
}

export function isForgeEnvironment(): boolean {
  if (typeof window !== "undefined") {
    return Boolean(
      (window as unknown as { __FORGE_BRIDGE__?: boolean }).__FORGE_BRIDGE__ ||
      (window as unknown as { bridge?: unknown }).bridge
    );
  }
  return Boolean(process.env.FORGE_ENV || process.env.ATLASSIAN_ENVIRONMENT);
}


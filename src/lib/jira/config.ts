export const JIRA_CONFIG = {
  host: process.env.JIRA_HOST || "",
  email: process.env.JIRA_EMAIL || "ahmad.saad@edulevel.ai",
  apiToken: process.env.JIRA_API_TOKEN || "",
};

export function isJiraConfigured(): boolean {
  return Boolean(JIRA_CONFIG.host && JIRA_CONFIG.apiToken);
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


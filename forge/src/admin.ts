/**
 * Forge Admin Resolver - Custom UI admin page.
 * Handles field mapping, JQL config, and dashboard settings.
 * Stores config in Forge key-value storage.
 */
import Resolver from "@forge/resolver";
import { storage } from "@forge/api";

const resolver = new Resolver();

resolver.define("getAdminConfig", async () => {
  const [jql, spField, sprintField, podField] = await Promise.all([
    storage.get("jira_jql"),
    storage.get("jira_story_points_field"),
    storage.get("jira_sprint_field"),
    storage.get("jira_pod_field"),
  ]);

  return {
    jql: (jql as string) || "project in (DTR)",
    storyPointsField: (spField as string) || "customfield_10031",
    sprintField: (sprintField as string) || "customfield_10020",
    podField: (podField as string) || "customfield_10050",
  };
});

resolver.define("saveAdminConfig", async (req) => {
  const { jql, storyPointsField, sprintField, podField } =
    (req.payload || {}) as Record<string, string>;

  await Promise.all([
    storage.set("jira_jql", jql),
    storage.set("jira_story_points_field", storyPointsField),
    storage.set("jira_sprint_field", sprintField),
    storage.set("jira_pod_field", podField),
  ]);

  return { success: true };
});

export const handler = resolver.getDefinitions();

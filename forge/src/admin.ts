/**
 * Forge Admin Resolver - Custom UI admin page.
 * Handles field mapping, JQL config, and dashboard settings.
 * Stores config in Forge key-value storage.
 */
import Resolver from "@forge/resolver";
import { kvs } from "./kvsClient";

const resolver = new Resolver();

resolver.define("getAdminConfig", async () => {
  const [jql, spField, sprintField, podField] = await Promise.all([
    kvs.get("jira_jql"),
    kvs.get("jira_story_points_field"),
    kvs.get("jira_sprint_field"),
    kvs.get("jira_pod_field"),
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
    kvs.set("jira_jql", jql),
    kvs.set("jira_story_points_field", storyPointsField),
    kvs.set("jira_sprint_field", sprintField),
    kvs.set("jira_pod_field", podField),
  ]);

  return { success: true };
});

export const handler = resolver.getDefinitions();

import Resolver from "@forge/resolver";
import api, { route } from "@forge/api";
import { computeDashboardData } from "../../src/lib/jira/metricsEngine";
import { DashboardFilters, JiraWorkItem } from "../../src/lib/jira/types";
import enterpriseDataRaw from "../../src/lib/jira/enterpriseData.json";

const resolver = new Resolver();

resolver.define("getDashboardData", async (req) => {
  const filters: DashboardFilters = (req.payload as DashboardFilters) || {
    podId: "all",
    quarterId: "all",
    sprintId: "all",
  };

  try {
    // 1. In Forge, optionally query Jira Cloud directly using product fetch
    const jql =
      filters.podId !== "all"
        ? `project = "${filters.podId}"`
        : "project in (CRM, DTP, ERP, SEC, SRG)";

    const response = await api
      .asUser()
      .requestJira(
        route`/rest/api/3/search/jql?jql=${jql}&maxResults=500&fields=summary,status,issuetype,project,customfield_10016,customfield_10031,customfield_10020,created,resolutiondate,assignee,priority`
      );

    if (response.ok) {
      const data = await response.json();
      const issues = data.issues || [];

      if (issues.length > 0) {
        const liveItems: JiraWorkItem[] = issues.map((issue: Record<string, unknown>) => {
          const fields = (issue.fields || {}) as Record<string, unknown>;
          const project = (fields.project || {}) as Record<string, string>;
          const issuetype = (fields.issuetype || {}) as Record<string, string>;
          const status = (fields.status || {}) as Record<string, string>;
          const spRaw = fields.customfield_10031 ?? fields.customfield_10016 ?? 0;
          const storyPoints = typeof spRaw === "number" ? spRaw : parseFloat(String(spRaw)) || 0;
          const sprintObj = fields.customfield_10020;
          const sprints: string[] = Array.isArray(sprintObj)
            ? sprintObj.map((s: { name?: string }) => s.name || "").filter(Boolean)
            : [];
          const assigneeObj = fields.assignee as { displayName?: string } | undefined;
          const priorityObj = fields.priority as { name?: string } | undefined;

          return {
            key: String(issue.key || ""),
            summary: String(fields.summary || ""),
            podKey: project.key || "CRM",
            podName: project.name || "Customer Relationship Management",
            workType: issuetype.name || "Story",
            status: status.name || "To Do",
            quarter: "CY26 PI.1",
            sprints,
            storyPoints,
            team: project.name || "",
            assignee: assigneeObj?.displayName || "Unassigned",
            priority: priorityObj?.name || "Medium",
            createdDate: String(fields.created || ""),
            resolutionDate: fields.resolutiondate ? String(fields.resolutiondate) : undefined,
          };
        });

        return computeDashboardData(liveItems, filters);
      }
    }
  } catch (err) {
    console.warn("Forge Jira product fetch error, utilizing fallback portfolio data:", err);
  }

  // Fallback to enterprise dataset
  return computeDashboardData(enterpriseDataRaw as unknown as JiraWorkItem[], filters);
});

export const handler = resolver.getDefinitions();


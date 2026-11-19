import { computeDashboardData } from "./jira/metricsEngine";
import type { DashboardFilters, JiraWorkItem, SprintMeta } from "./jira/types";

const projectTypeFor = (fixVersions?: string[]): "ENH" | "PRJ" | "None" => {
  const versions = (fixVersions || []).map((version) => version.trim()).filter(Boolean);
  if (!versions.length) return "None";
  const isEnhancement = versions.some((version) =>
    version.toLocaleLowerCase().replace(/[\s-]/g, "") === "enhancementsenterpriseservices"
  );
  return isEnhancement ? "ENH" : "PRJ";
};


export function getAuditCards(auditItems: JiraWorkItem[], filters: DashboardFilters, sprintMeta: Record<string, SprintMeta> = {}) {
  const scopedAuditItems = (() => {
    const eligibleItems = [...new Map(auditItems.filter((item) => !/^cancel{1,2}ed$/i.test(item.status.trim())).map((item) => [item.key, item])).values()];
    const allByKey = new Map(eligibleItems.map((item) => [item.key, item]));
    const podValues = Array.isArray(filters.podId) ? filters.podId : [filters.podId];
    const allPods = podValues.includes("all");
    const selectedPods = podValues.filter((id) => id !== "all");
    const scope = computeDashboardData(eligibleItems, filters, sprintMeta);
    const scopedKeys = new Set([...scope.issueList, ...scope.developerIssueList].map((item) => item.key));
    const contextualItems = eligibleItems.map((item) => {
      if (!/^sub-?task$/i.test(item.workType) || !item.parentKey) return item;
      const parent = allByKey.get(item.parentKey);
      if (!parent) return item;
      return {
        ...item,
        quarter: item.quarter && item.quarter !== "All" ? item.quarter : parent.quarter,
        sprints: item.sprints.length ? item.sprints : parent.sprints,
      };
    });
    const directlyScoped = contextualItems.filter((item) => scopedKeys.has(item.key));
    // Features often have no sprint/PI themselves. Include those reached
    // through child work in scope, while respecting the selected pod(s).
    const includedKeys = new Set(directlyScoped.map((item) => item.key));
    for (const item of directlyScoped) {
      let parentKey = item.parentKey;
      const seen = new Set<string>([item.key]);
      while (parentKey && !seen.has(parentKey)) {
        seen.add(parentKey);
        const parent = allByKey.get(parentKey);
        if (!parent) break;
        if (/^feature$|^epic$/i.test(parent.workType) && (allPods || selectedPods.includes(parent.podKey))) includedKeys.add(parent.key);
        parentKey = parent.parentKey;
      }
    }
    return contextualItems.filter((item) => includedKeys.has(item.key));
  })();
  const auditCards = (() => {
    const projectsWithFeatures = new Set(auditItems.filter((item) => /^feature$/i.test(item.workType)).map((item) => item.projectKey));
    const isFeature = (item: JiraWorkItem) => /^feature$/i.test(item.workType) ||
      (/^epic$/i.test(item.workType) && !projectsWithFeatures.has(item.projectKey));
    const storyType = /^story$/i;
    const storiesWithoutSubtasksStatuses = new Set([
      "development",
      "development complete",
      "development completed",
      "continue",
      "completed",
      "done",
      "released",
      "in progress",
      "in review",
      "in reviews",
      "code review",
      "test case review",
      "test cases review",
      "test case reviews",
      "test completed",
      "in test",
      "in testing",
      "testing",
    ]);
    const bugType = /^(bug|defect)$/i;
    const subtaskType = /^sub-?task$/i;
    const byKey = new Map(auditItems.map((item) => [item.key, item]));
    const storiesWithSubtasks = new Set(auditItems
      .filter((item) => subtaskType.test(item.workType) && !/^cancel{1,2}ed$/i.test(item.status.trim()))
      .map((item) => item.parentKey?.trim())
      .filter((key): key is string => Boolean(key)));
    const resolvedParentType = (item: JiraWorkItem) => {
      const parent = item.parentKey ? byKey.get(item.parentKey) : undefined;
      return { type: item.parentWorkType || parent?.workType || "", projectKey: parent?.projectKey || item.projectKey };
    };
    const isOrphanedFrom = (item: JiraWorkItem, isExpectedParent: (type: string, projectKey?: string) => boolean) => {
      if (!item.parentKey) return true;
      const parent = resolvedParentType(item);
      // If Jira supplied a parent key but its type is unavailable in the
      // fetched data, don't report it as an orphan based on missing access.
      return Boolean(parent.type && !isExpectedParent(parent.type, parent.projectKey));
    };
    const isFeatureParent = (type: string, projectKey?: string) => /^feature$/i.test(type) ||
      (/^epic$/i.test(type) && !projectsWithFeatures.has(projectKey));
    const isInEstimateExcludedStatus = (status: string) => {
      const normalized = status.trim().toLowerCase().replace(/[\s_-]+/g, " ");
      return normalized === "pending approval";
    };
    const isStoryWithoutSubtasksAuditStatus = (status: string) => {
      const normalized = status.trim().toLowerCase().replace(/[\s_-]+/g, " ");
      return storiesWithoutSubtasksStatuses.has(normalized);
    };
    const hasNoOriginalEstimate = (item: JiraWorkItem) => !(Number(item.originalEstimateSeconds) > 0);
    const isSubtaskOfInProgressStory = (item: JiraWorkItem) => {
      if (!subtaskType.test(item.workType) || !item.parentKey) return false;
      const parent = byKey.get(item.parentKey);
      const parentType = item.parentWorkType || parent?.workType || "";
      return storyType.test(parentType) && parent?.status.trim().toLowerCase() === "in progress";
    };
    return [
      {
        title: "Features without Aha link",
        note: "Features missing their planning-system reference",
        explanation: "Jira Feature issues whose Aha! URL is empty/null in the selected pod, PI and sprint scope. This checks the Aha URL field, not whether a feature has child stories. Features whose field was not returned are excluded because its value is unknown.",
        issues: scopedAuditItems.filter((item) => /^feature$/i.test(item.workType) && item.ahaUrl === ""),
        tone: "violet",
      },
      {
        title: "Stories without Feature links",
        note: "Stories without a linked Feature parent",
        explanation: "A story is counted when it has no parent, or its known parent is not a Feature (Epic is used for projects with no Feature issue type).",
        issues: scopedAuditItems.filter((item) => storyType.test(item.workType) && isOrphanedFrom(item, isFeatureParent)),
        tone: "amber",
      },
      {
        title: "Features without due date",
        note: "Features or Epics missing Jira due dates",
        explanation: "Feature due dates are read from Jira's due date field. Epic is used for projects with no Feature issue type.",
        issues: scopedAuditItems.filter((item) => isFeature(item) && !item.dueDate?.trim()),
        tone: "rose",
      },
      {
        title: "Features without PI tagging",
        note: "Features without a recognized Program Increment",
        explanation: "PI tagging is derived from the feature's sprint name using the dashboard's quarter/PI mapping. Features with no recognized PI are included.",
        issues: scopedAuditItems.filter((item) => isFeature(item) && item.quarter === "All"),
        tone: "violet",
      },
      {
        title: "Features without Project and Enhancement Tagging",
        note: "Features with no Fix Version project type",
        explanation: "Features are classified using the same Project Type rules as Feature Predictability. A feature is included here when its Jira Fix Versions field is empty, which gives it the Project Type None.",
        issues: scopedAuditItems.filter((item) => /^feature$/i.test(item.workType) && projectTypeFor(item.fixVersions) === "None"),
        tone: "amber",
      },
      {
        title: "Defects without parent links",
        note: "Bugs without any linked parent issue",
        explanation: "A defect is orphaned only when it has no parent issue. A link to a Story, Feature, Epic, or any other parent means it is not orphaned.",
        issues: scopedAuditItems.filter((item) => bugType.test(item.workType) && !item.parentKey?.trim()),
        tone: "orange",
      },
      {
        title: "Stories without subtasks",
        note: "Development, review, testing, and completed stories with no sub-tasks",
        explanation: "Stories are counted only when their status is Development, Development Completed, Continue, Completed, Done, Released, In Progress, In Review, Code Review, Test Case Review, Test Cases Review, Test Completed, In Test, or Testing, and no active sub-task in the fetched Jira data has them as its parent. Pre-development, Pending Approval, and Accepted statuses are excluded.",
        issues: scopedAuditItems.filter((item) =>
          storyType.test(item.workType) &&
          isStoryWithoutSubtasksAuditStatus(item.status) &&
          !storiesWithSubtasks.has(item.key)
        ),
        tone: "blue",
      },
      {
        title: "Subtasks without original estimate",
        note: "Subtasks under In Progress stories with no original estimate",
        explanation: "A sub-task is counted when its parent is an In Progress Story and it has no positive original estimate in Jira.",
        issues: scopedAuditItems.filter((item) => isSubtaskOfInProgressStory(item) && hasNoOriginalEstimate(item)),
        tone: "teal",
      },
      {
        title: "Stories Without Estimates",
        note: "Stories with 0 story points, excluding Pending Approval",
        explanation: "A story is included when it has no story points (0) and its status is not Pending Approval.",
        issues: scopedAuditItems.filter((item) =>
          storyType.test(item.workType) &&
          !(item.storyPoints > 0) &&
          !isInEstimateExcludedStatus(item.status)
        ),
        tone: "teal",
      },
    ];
  })();
  return { scopedAuditItems, auditCards };
}

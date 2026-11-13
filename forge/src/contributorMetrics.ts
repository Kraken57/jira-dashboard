/** Pure calculation, mirrored in forge/src/contributorMetrics.ts. */
interface ContributionItem {
  key: string;
  workType: string;
  status: string;
  parentKey?: string;
  assignee?: string;
  originalEstimateSeconds?: number;
  timeSpentSeconds?: number;
  storyPoints: number;
  summary?: string;
  podKey?: string;
  podName?: string;
  sprints?: string[];
}

export interface ContributionWorkDetail {
  key: string;
  summary: string;
  workType: string;
  status: string;
  originalEstimateHours: number;
  loggedEffortHours: number;
}

export interface StoryAllocationDetail {
  storyKey: string;
  summary: string;
  storyPoints: number;
  originalEstimateHours: number;
  totalStoryEstimateHours: number;
  share: number;
  attributedStoryPoints: number;
  subtasks: ContributionWorkDetail[];
}

export interface ContributorSprintDetail {
  id: string;
  sprintId: string;
  sprintName: string;
  podKey: string;
  podName: string;
  dateRanges: { startDate: string; endDate: string }[];
  contributorCount: number;
  subtaskCount: number;
  originalEstimateHours: number;
  loggedEffortHours: number;
  attributedStoryPoints: number;
  efficiency: number | null;
  workItems: ContributionWorkDetail[];
  allocations: StoryAllocationDetail[];
}

interface ContributionDetailContext {
  scopedWork: ContributionItem[];
  completionSprint: (story: ContributionItem) => string | null;
  includeSprint: (sprint: string) => boolean;
  sprintInfo: (sprint: string, podKey: string) => {
    name: string;
    dateRanges: { startDate: string; endDate: string }[];
  };
}

interface CapacityPerson {
  name: string;
  assignedSubtasks: number;
  originalEstimateHours: number;
  loggedHours?: number;
}

export interface IndividualContribution {
  name: string;
  subtaskCount: number;
  originalEstimateHours: number;
  loggedEffortHours: number;
  attributedStoryPoints: number;
  /** Attributed SP per logged hour; null when no logged effort exists. */
  efficiency: number | null;
  sprintDetails?: ContributorSprintDetail[];
}

export interface ContributorMetrics {
  people: IndividualContribution[];
  storiesWithoutSubtasks: number;
  storiesWithoutEstimates: number;
  subtasksWithoutEstimates: number;
  unassignedStoryPoints: number;
}

export interface SubtaskStoryPointAttribution {
  attributedStoryPoints: number;
  subtaskEstimateHours: number;
  totalStoryEstimateHours: number;
  storyPoints: number;
}

/** Allocate each completed story's points to its subtasks by positive original estimate. */
export function attributeStoryPointsBySubtask(
  completedStories: ContributionItem[],
  allItems: ContributionItem[],
): Map<string, SubtaskStoryPointAttribution> {
  const childrenByStory = new Map<string, ContributionItem[]>();
  for (const item of new Map(allItems.map((row) => [row.key, row])).values()) {
    if (!/^sub-?task$/i.test(item.workType) || !item.parentKey || /^cancel{1,2}ed$/i.test(item.status.trim())) continue;
    childrenByStory.set(item.parentKey, [...(childrenByStory.get(item.parentKey) || []), item]);
  }
  const attributed = new Map<string, SubtaskStoryPointAttribution>();
  for (const story of new Map(completedStories.map((row) => [row.key, row])).values()) {
    if (!/^story$/i.test(story.workType) || /^cancel{1,2}ed$/i.test(story.status.trim())) continue;
    const children = childrenByStory.get(story.key) || [];
    const estimateSeconds = (item: ContributionItem) => Number.isFinite(item.originalEstimateSeconds)
      ? Math.max(0, item.originalEstimateSeconds || 0) : 0;
    const totalEstimate = children.reduce((sum, item) => sum + estimateSeconds(item), 0);
    if (totalEstimate <= 0) continue;
    const storyPoints = Math.max(0, story.storyPoints || 0);
    for (const child of children) {
      const estimate = estimateSeconds(child);
      if (estimate > 0) attributed.set(child.key, {
        attributedStoryPoints: estimate / totalEstimate * storyPoints,
        subtaskEstimateHours: estimate / 3600,
        totalStoryEstimateHours: totalEstimate / 3600,
        storyPoints,
      });
    }
  }
  return attributed;
}

export function buildContributorMetrics(
  capacityPeople: CapacityPerson[],
  completedStories: ContributionItem[],
  allItems: ContributionItem[],
  context?: ContributionDetailContext,
): ContributorMetrics {
  const attributedBySubtask = attributeStoryPointsBySubtask(completedStories, allItems);
  const detailByPerson = new Map<string, Map<string, ContributorSprintDetail>>();
  const contributorsByGroup = new Map<string, Set<string>>();
  const workDetail = (item: ContributionItem): ContributionWorkDetail => ({
    key: item.key, summary: item.summary || item.key, workType: item.workType, status: item.status,
    originalEstimateHours: (item.originalEstimateSeconds || 0) / 3600,
    loggedEffortHours: (item.timeSpentSeconds || 0) / 3600,
  });
  const groupFor = (name: string, sprint: string, item: ContributionItem) => {
    const podKey = item.podKey || "UNKNOWN";
    const id = JSON.stringify([podKey, sprint]);
    const groups = detailByPerson.get(name) || new Map<string, ContributorSprintDetail>();
    if (!groups.has(id)) {
      const info = context!.sprintInfo(sprint, podKey);
      groups.set(id, { id, sprintId: sprint, sprintName: info.name, podKey,
        podName: item.podName || podKey, dateRanges: info.dateRanges, contributorCount: 0,
        subtaskCount: 0, originalEstimateHours: 0, loggedEffortHours: 0,
        attributedStoryPoints: 0, efficiency: null, workItems: [], allocations: [] });
    }
    detailByPerson.set(name, groups);
    const names = contributorsByGroup.get(id) || new Set<string>();
    if (name !== "Unassigned") names.add(name);
    contributorsByGroup.set(id, names);
    return groups.get(id)!;
  };
  if (context) {
    for (const item of new Map(context.scopedWork.map((item) => [item.key, item])).values()) {
      if (!/^(story|sub-?task)$/i.test(item.workType) || /^cancel{1,2}ed$/i.test(item.status.trim())) continue;
      const sprints = [...new Set(item.sprints?.length ? item.sprints : [""])].filter(context.includeSprint);
      for (const sprint of sprints) {
        const group = groupFor(item.assignee || "Unassigned", sprint, item);
        group.workItems.push(workDetail(item));
        group.originalEstimateHours += (item.originalEstimateSeconds || 0) / 3600;
        group.loggedEffortHours += (item.timeSpentSeconds || 0) / 3600;
        if (/^sub-?task$/i.test(item.workType)) group.subtaskCount++;
      }
    }
  }
  const people = new Map(capacityPeople.map((person) => [person.name, {
    name: person.name,
    subtaskCount: person.assignedSubtasks,
    originalEstimateHours: person.originalEstimateHours,
    loggedEffortHours: person.loggedHours || 0,
    attributedStoryPoints: 0,
    efficiency: null as number | null,
  }]));
  const children = new Map<string, ContributionItem[]>();
  for (const item of new Map(allItems.map((item) => [item.key, item])).values()) {
    if (!/^sub-?task$/i.test(item.workType) || !item.parentKey || /^cancel{1,2}ed$/i.test(item.status.trim())) continue;
    children.set(item.parentKey, [...(children.get(item.parentKey) || []), item]);
  }
  let storiesWithoutSubtasks = 0;
  let storiesWithoutEstimates = 0;
  let subtasksWithoutEstimates = 0;
  let unassignedStoryPoints = 0;
  for (const story of new Map(completedStories.map((story) => [story.key, story])).values()) {
    if (!/^story$/i.test(story.workType) || /^cancel{1,2}ed$/i.test(story.status.trim())) continue;
    const subtasks = children.get(story.key) || [];
    if (!subtasks.length) { storiesWithoutSubtasks++; continue; }
    const positiveEstimate = (item: ContributionItem) => Number.isFinite(item.originalEstimateSeconds)
      ? Math.max(0, item.originalEstimateSeconds || 0) : 0;
    const totalSeconds = subtasks.reduce((sum, item) => sum + positiveEstimate(item), 0);
    subtasksWithoutEstimates += subtasks.filter((item) => !positiveEstimate(item)).length;
    if (!totalSeconds) { storiesWithoutEstimates++; continue; }
    const allocations = new Map<string, StoryAllocationDetail>();
    for (const subtask of subtasks) {
      const points = attributedBySubtask.get(subtask.key)?.attributedStoryPoints || 0;
      const name = subtask.assignee || "Unassigned";
      if (name === "Unassigned") { unassignedStoryPoints += points; continue; }
      if (context) {
        const allocation = allocations.get(name) || { storyKey: story.key, summary: story.summary || story.key,
          storyPoints: Math.max(0, story.storyPoints || 0), originalEstimateHours: 0,
          totalStoryEstimateHours: totalSeconds / 3600, share: 0, attributedStoryPoints: 0, subtasks: [] };
        allocation.originalEstimateHours += positiveEstimate(subtask) / 3600;
        allocation.share += positiveEstimate(subtask) / totalSeconds;
        allocation.attributedStoryPoints += points;
        allocation.subtasks.push(workDetail(subtask));
        allocations.set(name, allocation);
      }
      if (!points) continue;
      // A child can belong to an earlier sprint while its story completes now.
      // Keep its point credit visible without inventing hours in the selected work scope.
      const person = people.get(name) || { name, subtaskCount: 0, originalEstimateHours: 0,
        loggedEffortHours: 0, attributedStoryPoints: 0, efficiency: null };
      person.attributedStoryPoints += points;
      people.set(name, person);
    }
    if (context) for (const [name, allocation] of allocations) {
      const group = groupFor(name, context.completionSprint(story) || "", story);
      group.allocations.push(allocation);
      group.attributedStoryPoints += allocation.attributedStoryPoints;
    }
  }
  for (const person of people.values()) {
    person.efficiency = person.loggedEffortHours > 0
      ? person.attributedStoryPoints / person.loggedEffortHours : null;
  }
  const result: IndividualContribution[] = [...people.values()].map((person) => {
    const sprintDetails = [...(detailByPerson.get(person.name)?.values() || [])];
    for (const group of sprintDetails) {
      group.contributorCount = contributorsByGroup.get(group.id)?.size || 0;
      group.originalEstimateHours = Math.round(group.originalEstimateHours * 10) / 10;
      group.loggedEffortHours = Math.round(group.loggedEffortHours * 10) / 10;
      group.efficiency = group.loggedEffortHours > 0 ? group.attributedStoryPoints / group.loggedEffortHours : null;
      group.workItems.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
    }
    const start = (group: ContributorSprintDetail) => Math.min(...group.dateRanges.map((range) => Date.parse(range.startDate)).filter(Number.isFinite), Infinity);
    sprintDetails.sort((a, b) => (start(a) - start(b)) || a.sprintName.localeCompare(b.sprintName, undefined, { numeric: true }) || a.podName.localeCompare(b.podName));
    return { ...person, ...(context ? { sprintDetails } : {}) };
  });
  return { people: result, storiesWithoutSubtasks, storiesWithoutEstimates,
    subtasksWithoutEstimates, unassignedStoryPoints };
}

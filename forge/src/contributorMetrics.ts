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
}

export interface ContributorMetrics {
  people: IndividualContribution[];
  storiesWithoutSubtasks: number;
  storiesWithoutEstimates: number;
  subtasksWithoutEstimates: number;
  unassignedStoryPoints: number;
}

export function buildContributorMetrics(
  capacityPeople: CapacityPerson[],
  completedStories: ContributionItem[],
  allItems: ContributionItem[],
): ContributorMetrics {
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
    for (const subtask of subtasks) {
      const points = (positiveEstimate(subtask) / totalSeconds) * Math.max(0, story.storyPoints || 0);
      if (!points) continue;
      const name = subtask.assignee || "Unassigned";
      if (name === "Unassigned") { unassignedStoryPoints += points; continue; }
      // A child can belong to an earlier sprint while its story completes now.
      // Keep its point credit visible without inventing hours in the selected work scope.
      const person = people.get(name) || { name, subtaskCount: 0, originalEstimateHours: 0,
        loggedEffortHours: 0, attributedStoryPoints: 0, efficiency: null };
      person.attributedStoryPoints += points;
      people.set(name, person);
    }
  }
  for (const person of people.values()) {
    person.efficiency = person.loggedEffortHours > 0
      ? person.attributedStoryPoints / person.loggedEffortHours : null;
  }
  return { people: [...people.values()], storiesWithoutSubtasks, storiesWithoutEstimates,
    subtasksWithoutEstimates, unassignedStoryPoints };
}

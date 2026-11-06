import { JiraWorkItem } from "./types";

export function featureDelivery(feature: JiraWorkItem, items: JiraWorkItem[], doneStatuses: string[], now = Date.now()) {
  const byKey = new Map(items.map((item) => [item.key, item]));
  const belongsTo = (item: JiraWorkItem, key: string) => {
    let parent = item.parentKey;
    const seen = new Set<string>([item.key]);
    while (parent && !seen.has(parent)) {
      if (parent === key) return true;
      seen.add(parent);
      parent = byKey.get(parent)?.parentKey;
    }
    return false;
  };
  const stories = items.filter((item) => /^story$/i.test(item.workType) && belongsTo(item, feature.key));
  const completed = stories.filter((item) => doneStatuses.includes(item.status)).length;
  const delivered = stories.length > 0 && completed === stories.length;
  const due = feature.dueDate ? Date.parse(`${feature.dueDate.slice(0, 10)}T23:59:59.999Z`) : NaN;
  const overdue = Number.isFinite(due) && now > due;
  const completionDates = stories.map((item) => Date.parse(item.resolutionDate || ""));
  const completionKnown = delivered && completionDates.every(Number.isFinite);
  const eligible = stories.length > 0 && Number.isFinite(due) && (!delivered || completionKnown);
  const predictable = eligible && (delivered ? Math.max(...completionDates) <= due : !overdue);
  const loggedItems = items.filter((item) => /^story$|^sub-?task$/i.test(item.workType) && belongsTo(item, feature.key));
  return {
    stories, completed, eligible, predictable,
    status: !stories.length ? "No stories" : delivered ? "Delivered" : overdue ? "Past Due Date" : "In Progress",
    startDate: feature.startDate || stories.map((item) => item.startDate).filter((date): date is string => Boolean(date)).sort()[0],
    startFromStories: !feature.startDate,
    storyPoints: stories.reduce((sum, item) => sum + (item.storyPoints || 0), 0),
    hours: Math.round(loggedItems.reduce((sum, item) => sum + (item.timeSpentSeconds || 0), 0) / 360) / 10,
  };
}

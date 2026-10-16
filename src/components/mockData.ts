export type Pod = { id: string; name: string; teamCount: number };

export type Sprint = {
  id: string;
  name: string;
  team: string;
  startDate: string;
  endDate: string;
  stories: { committed: number; completed: number; carriedOver: number; added: number; removed: number };
  storyPoints: { planned: number; committed: number; completed: number; carriedOver: number };
};

export type MetricCard = {
  title: string;
  value: string | number;
  subtitle: string;
  trend: number;
  trendLabel: string;
  color: "blue" | "green" | "red";
};

export const PODS: Pod[] = [
  { id: "all", name: "All Pods", teamCount: 7 },
  { id: "pod-1", name: "Pod Alpha", teamCount: 1 },
  { id: "pod-2", name: "Pod Beta", teamCount: 1 },
  { id: "pod-3", name: "Pod Gamma", teamCount: 1 },
  { id: "pod-4", name: "Pod Delta", teamCount: 1 },
  { id: "pod-5", name: "Pod Epsilon", teamCount: 1 },
  { id: "pod-6", name: "Pod Zeta", teamCount: 1 },
  { id: "pod-7", name: "Pod Omega", teamCount: 1 },
];

export const SPRINTS: Sprint[] = [
  {
    id: "sprint-1",
    name: "Sprint 24 - Core",
    team: "Platform Team",
    startDate: "2026-09-01",
    endDate: "2026-09-14",
    stories: { committed: 12, completed: 10, carriedOver: 2, added: 3, removed: 1 },
    storyPoints: { planned: 40, committed: 39, completed: 32, carriedOver: 8 },
  },
  {
    id: "sprint-2",
    name: "Sprint 25 - Core",
    team: "Platform Team",
    startDate: "2026-09-15",
    endDate: "2026-09-28",
    stories: { committed: 14, completed: 13, carriedOver: 1, added: 2, removed: 0 },
    storyPoints: { planned: 42, committed: 41, completed: 38, carriedOver: 4 },
  },
  {
    id: "sprint-3",
    name: "Sprint 12 - Delivery",
    team: "Delivery Team",
    startDate: "2026-09-01",
    endDate: "2026-09-14",
    stories: { committed: 10, completed: 8, carriedOver: 2, added: 1, removed: 2 },
    storyPoints: { planned: 35, committed: 34, completed: 28, carriedOver: 7 },
  },
  {
    id: "sprint-4",
    name: "Sprint 13 - Delivery",
    team: "Delivery Team",
    startDate: "2026-09-15",
    endDate: "2026-09-28",
    stories: { committed: 11, completed: 10, carriedOver: 1, added: 2, removed: 1 },
    storyPoints: { planned: 38, committed: 37, completed: 35, carriedOver: 3 },
  },
];

export const EXECUTIVE_METRICS: MetricCard[] = [
  {
    title: "Say/Do Ratio",
    value: "82%",
    subtitle: "Issues completed vs committed",
    trend: 12,
    trendLabel: "up from last sprint",
    color: "green",
  },
  {
    title: "Sprint Carry Over",
    value: "18%",
    subtitle: "Points carried to next sprint",
    trend: -5,
    trendLabel: "down from last sprint",
    color: "red",
  },
  {
    title: "Team/Epic Velocity",
    value: "34 pts",
    subtitle: "Avg story points per sprint",
    trend: 3,
    trendLabel: "up from last sprint",
    color: "blue",
  },
  {
    title: "Feature Predictability",
    value: "89%",
    subtitle: "Epics delivered on time",
    trend: 2,
    trendLabel: "stable",
    color: "green",
  },
];

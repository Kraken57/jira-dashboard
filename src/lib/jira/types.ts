export interface PodOption {
  id: string;
  key: string;
  name: string;
  sub?: string;
}

export interface QuarterOption {
  id: string;
  name: string;
  sub?: string;
}

export interface SprintOption {
  id: string;
  name: string;
  sub?: string;
}

export interface MetricInsightTrend {
  currentLabel: string;
  previousLabel: string;
  current: number;
  previous: number;
  delta: number;
  unit: "pp" | "%" | "SP";
  better: "up" | "down";
  display?: string;
}

export interface MetricInsightTarget {
  label: string;
  value: number;
  current?: number;
  unit: "pp" | "%" | "SP";
  direction: "atLeast" | "atMost";
}

export interface MetricInsightRecentRow {
  label: string;
  value: string;
  detail?: string;
}

export interface MetricInsight {
  what: string;
  formula?: string;
  calculation?: string;
  howToCompare?: string;
  target?: MetricInsightTarget;
  trend?: MetricInsightTrend;
  recent?: MetricInsightRecentRow[];
  takeaways?: string[];
}

export interface MetricConfig {
  doneStatuses: string[];
  subtaskDoneStatuses: string[];
  sprintWindow: number;
  nextSprintRevealDays: number;
  qaCapacityHoursPerWeek: number;
  qaTestIssueTypes: string[];
  qaSupportIssueTypes: string[];
  qaMembers: string[];
}

/**
 * The raw feed: unfiltered work items + sprint metadata, fetched once per
 * TTL window. The client computes every filter with computeDashboardData.
 * `source` tells the UI which backend served it (disk file, KVS cupboard,
 * or a live Jira download).
 */
export interface RawFeedPayload {
  items: JiraWorkItem[];
  /** QA defects fetched from Jira using the dedicated QA defect JQL. */
  qaDefects?: IssueRow[];
  /** Optional separately queried UAT defects. Undefined means no JQL is configured. */
  qaUatDefects?: IssueRow[];
  /** Optional separately queried escaped/leaked defects. Undefined means no JQL is configured. */
  qaLeakageDefects?: IssueRow[];
  /** Opaque hash of the JQL inputs used to create this cached feed. */
  queryFingerprint?: string;
  sprintMeta: Record<string, SprintMeta>;
  jiraBaseUrl: string;
  fetchedAt: number;
  config: MetricConfig;
  zephyr?: ZephyrData;
  source: "disk" | "disk-stale" | "jira-live" | "kvs" | "kvs-stale" | "forge-live";
  ageMs?: number;
}

export interface MetricCardData {
  title: string;
  value: string | number;
  subtitle: string;
  trend: number;
  trendLabel: string;
  trendUnit?: "pp" | "%" | "SP";
  trendText?: string;
  color: "blue" | "green" | "red";
  drilldownTab?: string;
  trendGood?: "up" | "down";
}

export interface SprintMeta {
  name: string;
  state?: string;
  endDate?: string;
}

export interface VelocityChartData {
  labels: string[];
  completed: number[];
  committed: number[];
  totalFinished: number;
  avgLastThree: number;
  trendStatus: "rising" | "falling" | "stable";
}

export interface DeliveryChartData {
  labels: string[];
  planned: number[];
  committed: number[];
  done: number[];
  carried: number[];
}

export interface FilterSummary {
  totalIssues: number;
  completedIssues: number;
  inProgressIssues: number;
  totalStoryPoints: number;
  completedStoryPoints: number;
}

export interface DeveloperStat {
  name: string;
  team: string;
  assignedIssues: number;
  completedIssues: number;
  assignedStories: number;
  assignedSubtasks: number;
  completedStories: number;
  completedSubtasks: number;
  deliveredSP: number;
  totalSP: number;
  originalEstimateHours: number;
  completedEstimateHours: number;
  completionRate: number;
}

export interface SprintAnalysisData {
  scopeChurnPct: number;
  plannedWorkPct: number;
  unplannedWorkPct: number;
  avgCycleTimeDays: number;
  avgLeadTimeDays: number;
  workTypeBreakdown: { type: string; count: number; storyPoints: number }[];
  statusBreakdown: { status: string; count: number; color: string }[];
}

export interface QaMemberStat {
  name: string;
  /** Actual Jira assignee strings this member matched (may differ in dots/spaces). */
  aliasNames?: string[];
  /** Per-pod slices for the in-tab team filter (formed inside the models). */
  hoursByPod?: Record<string, number>;
  supportByPod?: Record<string, number>;
  testsByPod?: Record<string, number>;
  openTestsByPod?: Record<string, number>;
  issuesByPod?: Record<string, number>;
  /** Zephyr execution summary (configured project keys), if ZAPI is reachable. */
  executions?: string;
  podKeys: string[];
  podNames: string[];
  assignedIssues: number;
  allocatedHours: number;
  completedHours: number;
  supportedHours: number;
  availableHours: number;
  testCases: number;
  openTestCases: number;
  capacityHours: number;
  utilisationPct: number;
}

export interface QaCapacityData {
  members: QaMemberStat[];
  totalCapacityHours: number;
  allocatedHours: number;
  supportedHours: number;
  availableHours: number;
  testCasesTotal: number;
}

export interface ZephyrData {
  available: boolean;
  message?: string;
  failure?: DashboardLoadFailure;
  testCasesTotal?: number;
  testExecutionsTotal?: number;
  cases?: ZephyrTestCase[];
  metricsByAlias?: Record<
    string,
    { pass: number; fail: number; wip: number; blocked: number; unexecuted: number; total: number }
  >;
}

export interface DashboardLoadFailure {
  api: string;
  statusCode: number | null;
  message: string;
}

export interface ZephyrTestCase {
  id: string;
  key: string;
  name: string;
  projectKey: string;
  projectName: string;
  podKeys: string[];
  podNames: string[];
  podSource: "linked Jira issue" | "project mapping" | "project fallback";
  ownerName: string;
  ownerAccountId?: string;
  status: string;
  priority: string;
  folder: string;
  labels: string[];
  linkedIssueKeys: string[];
  /** Numeric Jira issue IDs supplied by Zephyr when links omit issue keys. */
  linkedIssueIds?: string[];
  /** Jira sprint names inherited from the linked Jira issues. */
  sprints: string[];
  createdOn?: string;
  objective?: string;
  precondition?: string;
  executionCount: number;
  latestExecution?: ZephyrExecution;
  executions: ZephyrExecution[];
}

export interface ZephyrExecution {
  id: string;
  status: string;
  statusCategory: "passed" | "failed" | "blocked" | "in-progress" | "pending" | "other";
  assignedTo: string;
  executedBy: string;
  executedOn?: string;
  cycle: string;
}

export interface QualityData {
  defectDensity: number;
  totalBugs: number;
  resolvedBugs: number;
  resolutionRate: number;
  avgResolutionDays: number;
  priorityDistribution: { priority: string; count: number; color: string }[];
}

export interface PredictabilityData {
  score: number;
  varianceSP: number;
  epicsOnSchedule: number;
  forecastableFeatures: number;
  unestimatedFeatures: number;
  history: { sprint: string; planned: number; delivered: number; sayDo: number }[];
}

export interface TrendsData {
  velocityTrend: { labels: string[]; velocity: number[]; movingAvg: number[] };
  cumulativeThroughput: { labels: string[]; totalIssues: number[]; completedIssues: number[] };
}

export interface IssueRow {
  key: string;
  summary: string;
  workType: string;
  status: string;
  storyPoints: number;
  podKey: string;
  podName: string;
  sprint: string;
  assignee: string;
  reporter?: string;
  projectKey?: string;
  projectName?: string;
  priority: string;
  createdDate: string;
  resolutionDate?: string;
  dueDate?: string;
  isDone: boolean;
  /** Sprint in which Jira resolved this issue, inferred from resolution/sprint dates. */
  completionSprint?: string;
  originalEstimateHours?: number;
  isSubtask?: boolean;
  reason?: string;
}

export interface ContributorSlippage {
  name: string;
  team: string;
  incompleteSP: number;
  completedSP: number;
  totalAssignedSP: number;
  incompleteIssuesCount: number;
  primaryReason: string;
}

export interface UnfinishedIssue {
  key: string;
  summary: string;
  workType: string;
  status: string;
  storyPoints: number;
  podKey: string;
  podName: string;
  sprint: string;
  assignee: string;
  priority: string;
  reason: string;
}

export interface DiagnosisData {
  slippageSP: number;
  slippagePct: number;
  primaryDriver: string;
  atRiskContributorsCount: number;
  contributors: ContributorSlippage[];
  unfinishedIssues: UnfinishedIssue[];
}

export interface DashboardData {
  pods: PodOption[];
  quarters: QuarterOption[];
  sprints: SprintOption[];
  metrics: MetricCardData[];
  velocity: VelocityChartData;
  delivery: DeliveryChartData;
  summary: FilterSummary;
  developers: DeveloperStat[];
  sprintAnalysis: SprintAnalysisData;
  quality: QualityData;
  qaCapacity?: QaCapacityData;
  zephyr?: ZephyrData;
  predictability: PredictabilityData;
  trends: TrendsData;
  diagnosis: DiagnosisData;
  issueList: IssueRow[];
  developerIssueList: IssueRow[];
  podFeatureList?: IssueRow[];
  metricInsights?: Record<string, MetricInsight>;
  jiraBaseUrl?: string;
}

export interface DashboardFilters {
  podId: string | string[];
  quarterId: string | string[];
  sprintId: string | string[];
}

export interface JiraWorkItem {
  key: string;
  summary: string;
  podKey: string;
  podName: string;
  workType: string;
  status: string;
  quarter: string;
  sprints: string[];
  storyPoints: number;
  team: string;
  projectKey?: string;
  projectName?: string;
  assignee?: string;
  reporter?: string;
  priority?: string;
  parentKey?: string;
  parentWorkType?: string;
  resolutionDate?: string;
  createdDate?: string;
  dueDate?: string;
  originalEstimateSeconds?: number;
  timeSpentSeconds?: number;
  startDate?: string;
}

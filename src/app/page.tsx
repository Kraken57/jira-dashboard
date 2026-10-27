"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TabBar } from "@/components/TabBar";
import { MetricCard } from "@/components/MetricCard";
import { VelocityGrid } from "@/components/VelocityGrid";
import { TabFilters, FilterKey, FilterState, FilterOption } from "@/components/TabFilters";
import { IssuesModal } from "@/components/IssuesModal";
import { fetchDashboardData } from "@/lib/api";
import { DashboardData, SprintOption, IssueRow } from "@/lib/jira/types";
import { PodTab } from "@/components/tabs/PodTab";
import { DeveloperTab } from "@/components/tabs/DeveloperTab";
import { QualityTab } from "@/components/tabs/QualityTab";
import { PredictabilityTab } from "@/components/tabs/PredictabilityTab";
import { TrendsCharts } from "@/components/TrendsCharts";
import { DiagnosisTab } from "@/components/tabs/DiagnosisTab";
import { IssuesTab } from "@/components/tabs/IssuesTab";

const TABS = [
  { id: "executive", label: "Executive Summary" },
  { id: "pod", label: "Pod View" },
  { id: "developer", label: "Developer View" },
  { id: "quality", label: "Quality" },
  { id: "predictability", label: "Predictability" },
  { id: "diagnosis", label: "Delivery Diagnosis" },
  { id: "issues", label: "Issues" },
];

// Pod / Quarter / Sprint are shared across tabs (a selection carries over).
// Each tab adds only the extra filters that make sense for it.
const TAB_FILTERS: Record<string, FilterKey[]> = {
  executive: ["pod", "quarter", "sprint"],
  pod: ["pod", "quarter", "sprint"],
  developer: ["pod", "quarter", "sprint", "developer"],
  quality: ["pod", "quarter", "sprint"],
  predictability: ["pod", "quarter"],
  diagnosis: ["pod", "quarter", "sprint", "status"],
  issues: ["pod", "quarter", "sprint"],
};

const BASE_DEFAULT = { pod: "all", quarter: "all", sprint: "all" };
const EXTRA_DEFAULT = { developer: "all", status: "all" };

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState("executive");
  const [baseFilters, setBaseFilters] = useState(BASE_DEFAULT);
  const [extraFilters, setExtraFilters] = useState<
    Record<string, typeof EXTRA_DEFAULT>
  >(() => Object.fromEntries(TABS.map((t) => [t.id, { ...EXTRA_DEFAULT }])));

  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [sprintOptions, setSprintOptions] = useState<SprintOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [issueModal, setIssueModal] = useState<{
    title: string;
    subtitle: string;
    issues: IssueRow[];
  } | null>(null);

  const filterKeys = TAB_FILTERS[activeTab] || [];
  const filters: FilterState = {
    ...baseFilters,
    ...extraFilters[activeTab],
  };
  // Tabs without a sprint filter always look at the whole window.
  const effectiveSprint = filterKeys.includes("sprint")
    ? baseFilters.sprint
    : "all";

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setIsLoading(true);
      setError(null);
      try {
        const base = { podId: baseFilters.pod, quarterId: baseFilters.quarter };
        const [primary, secondary] = await Promise.allSettled([
          fetchDashboardData({ ...base, sprintId: effectiveSprint }),
          effectiveSprint === "all"
            ? Promise.resolve(null)
            : fetchDashboardData({ ...base, sprintId: "all" }),
        ]);

        if (cancelled) return;
        if (primary.status === "rejected") throw primary.reason;

        const data = primary.value;
        const allSprints = secondary.status === "fulfilled" ? secondary.value : null;
        setDashboardData(data);
        if (allSprints) {
          setSprintOptions(allSprints.sprints);
        } else if (effectiveSprint === "all") {
          setSprintOptions(data.sprints);
        }
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load dashboard data");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, [baseFilters.pod, baseFilters.quarter, effectiveSprint, reloadKey]);

  const updateFilter = (key: FilterKey, value: string) => {
    if (key === "pod" || key === "quarter" || key === "sprint") {
      setBaseFilters((prev) => ({
        ...prev,
        [key]: value,
        ...(key === "pod" || key === "quarter" ? { sprint: "all" } : {}),
      }));
    } else {
      setExtraFilters((prev) => ({
        ...prev,
        [activeTab]: { ...prev[activeTab], [key]: value },
      }));
    }
  };

  const resetFilters = () => {
    setBaseFilters(BASE_DEFAULT);
    setExtraFilters((prev) => ({
      ...prev,
      [activeTab]: { ...EXTRA_DEFAULT },
    }));
  };

  const pods = dashboardData?.pods || [];
  const quarters = dashboardData?.quarters || [];
  const sprints = sprintOptions.length ? sprintOptions : dashboardData?.sprints || [];
  const metrics = dashboardData?.metrics || [];
  const selectedPodName = pods.find((p) => p.id === baseFilters.pod)?.name || "All Pods";
  const selectedQuarterName =
    quarters.find((q) => q.id === baseFilters.quarter)?.name || "All Quarters";
  const selectedSprintName =
    sprints.find((s) => s.id === baseFilters.sprint)?.name || "All Sprints";
  const scopeLabel =
    [
      selectedPodName,
      selectedQuarterName,
      selectedSprintName,
    ]
      .filter((v) => !v.startsWith("All"))
      .join(" · ") || "All work";

  const openMetricCard = (card: DashboardData["metrics"][number]) => {
    if (!dashboardData) return;
    const all = dashboardData.issueList;
    let issues = all;
    let label = "All work items in the current filters";

    switch (card.title) {
      case "Sprint Carry Over":
        issues = all.filter((i) => !i.isDone);
        label = "Not accepted / spilled-over committed work";
        break;
      case "Avg. Sprint Velocity":
      case "Total Sprint Velocity":
        issues = all.filter((i) => i.isDone);
        label = "Completed work items";
        break;
      case "Say/Do Ratio":
        issues = all.filter((i) => i.isDone);
        label = "Accepted / completed committed work";
        break;
      case "Future Predictability":
        issues = all.filter((i) => !i.isDone && !!i.reason);
        label = "Planned and past-due features vs due-date forecast";
        break;
    }

    setIssueModal({
      title: card.title,
      subtitle: `${label} · ${scopeLabel}`,
      issues,
    });
  };

  const statuses = Array.from(
    new Set((dashboardData?.diagnosis.unfinishedIssues || []).map((i) => i.status))
  ).sort();

  const filterOptions: Partial<Record<FilterKey, FilterOption[]>> = {
    pod: pods.map((p) => ({ id: p.id, name: p.name, sub: p.sub })),
    quarter: quarters.map((q) => ({ id: q.id, name: q.name, sub: q.sub })),
    sprint: sprints.map((s) => ({ id: s.id, name: s.name, sub: s.sub })),
    developer: [
      { id: "all", name: "All Developers" },
      ...(dashboardData?.developers || []).map((d) => ({ id: d.name, name: d.name })),
    ],
    status: [
      { id: "all", name: "All Statuses" },
      ...statuses.map((s) => ({ id: s, name: s })),
    ],
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page heading with live dataset summary */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-jira-text tracking-tight">
              Enterprise Sprint Performance
            </h1>
            <p className="text-sm text-jira-text-muted mt-0.5">
              Track sprint health, delivery metrics, and team velocity across all pods in Jira.
            </p>
          </div>
          {dashboardData && (
            <div className="flex items-center gap-2 self-start md:self-auto text-xs bg-jira-blue-bg/60 text-jira-blue font-semibold px-3 py-1.5 rounded-full border border-jira-blue/20">
              <span className="w-2 h-2 rounded-full bg-jira-blue animate-pulse" />
              <span>
                {dashboardData.summary.totalIssues} work items • {dashboardData.summary.totalStoryPoints} SP tracked
              </span>
            </div>
          )}
        </div>

        {error && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-jira-red/30 bg-jira-red-bg px-4 py-3">
            <div>
              <p className="text-sm font-bold text-jira-red">Could not load dashboard data</p>
              <p className="text-xs text-jira-text-muted mt-0.5 break-words">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="self-start sm:self-auto text-xs font-semibold px-3 py-1.5 rounded-md bg-white border border-jira-red/30 text-jira-red hover:bg-jira-red/10 transition"
            >
              Retry
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />

        {/* Per-tab filters (Pod/Quarter/Sprint carry over between tabs) */}
        <TabFilters
          keys={filterKeys}
          title={TABS.find((t) => t.id === activeTab)?.label}
          value={filters}
          options={filterOptions}
          onChange={updateFilter}
          onReset={resetFilters}
        />

        {/* Loading Indicator Overlay */}
        <div className={`transition-opacity duration-200 ${isLoading ? "opacity-60 pointer-events-none" : "opacity-100"}`}>
          {/* Executive Summary Tab */}
          {activeTab === "executive" && (
            <div className="space-y-6">
              <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {metrics.map((card) => (
                  <MetricCard
                    key={card.title}
                    {...card}
                    onOpen={() => openMetricCard(card)}
                  />
                ))}
              </section>

              {dashboardData && (
                <>
                  <VelocityGrid
                    velocity={dashboardData.velocity}
                    delivery={dashboardData.delivery}
                  />
                  <TrendsCharts data={dashboardData.trends} />
                </>
              )}
            </div>
          )}

          {activeTab === "pod" && dashboardData && (
            <PodTab data={dashboardData} podName={selectedPodName} />
          )}

          {activeTab === "developer" && dashboardData && (
            <DeveloperTab
              developers={dashboardData.developers}
              podName={selectedPodName}
              developerFilter={filters.developer}
              issues={dashboardData.developerIssueList}
              jiraDomain={dashboardData.jiraBaseUrl}
            />
          )}

          {activeTab === "quality" && dashboardData && (
            <QualityTab
              data={dashboardData.quality}
              issues={dashboardData.issueList}
              jiraDomain={dashboardData.jiraBaseUrl}
            />
          )}

          {activeTab === "predictability" && dashboardData && (
            <PredictabilityTab data={dashboardData.predictability} />
          )}

          {activeTab === "diagnosis" && dashboardData && (
            <DiagnosisTab
              data={dashboardData.diagnosis}
              podName={selectedPodName}
              jiraDomain={dashboardData.jiraBaseUrl}
              statusFilter={filters.status}
            />
          )}

          {activeTab === "issues" && dashboardData && (
            <IssuesTab
              issues={dashboardData.issueList}
              jiraDomain={dashboardData.jiraBaseUrl}
            />
          )}
        </div>

        {issueModal && dashboardData && (
          <IssuesModal
            title={issueModal.title}
            subtitle={issueModal.subtitle}
            issues={issueModal.issues}
            jiraDomain={dashboardData.jiraBaseUrl}
            insight={dashboardData.metricInsights?.[issueModal.title]}
            onClose={() => setIssueModal(null)}
          />
        )}
      </div>
    </DashboardLayout>
  );
}

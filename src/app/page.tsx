"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TabBar } from "@/components/TabBar";
import { MetricCard } from "@/components/MetricCard";
import { TabFilters, FilterKey, FilterState, FilterOption, FilterValue } from "@/components/TabFilters";
import { IssuesModal } from "@/components/IssuesModal";
import { FeatureDetailsModal } from "@/components/FeatureDetailsModal";
import {
  DashboardLoadErrorPanel,
  DashboardLoadingOverlay,
} from "@/components/DashboardLoadState";
import type { DashboardLoadingStage } from "@/components/DashboardLoadState";
import {
  fetchRawFeed,
  fetchZephyrData,
  getDashboardLoadFailure,
  isRawFeedStale,
  readSessionRawFeed,
  writeSessionRawFeed,
} from "@/lib/api";
import { computeDashboardData } from "@/lib/jira/metricsEngine";
import { DashboardData, DashboardLoadFailure, RawFeedPayload, IssueRow } from "@/lib/jira/types";
import { PodTab } from "@/components/tabs/PodTab";
import { DeveloperTab } from "@/components/tabs/DeveloperTab";
import { QualityTab } from "@/components/tabs/QualityTab";
import { TrendsCharts } from "@/components/TrendsCharts";
import { DiagnosisTab } from "@/components/tabs/DiagnosisTab";
import { IssuesTab } from "@/components/tabs/IssuesTab";

const TABS = [
  { id: "executive", label: "Executive Summary" },
  { id: "pod", label: "Pod View" },
  { id: "developer", label: "Capacity View" },
  { id: "quality", label: "Quality" },
  { id: "diagnosis", label: "Delivery Diagnosis" },
  { id: "issues", label: "Audit Issues" },
];

// Pod / Quarter / Sprint are shared across tabs (a selection carries over).
// Each tab adds only the extra filters that make sense for it.
const TAB_FILTERS: Record<string, FilterKey[]> = {
  executive: ["pod", "quarter", "sprintStatus", "sprint"],
  pod: ["pod", "quarter", "sprintStatus", "sprint"],
  developer: ["pod", "quarter", "sprintStatus", "sprint", "developer"],
  quality: [], // QA tab owns its filters (per-member, per-team slicing)
  diagnosis: ["pod", "quarter", "sprintStatus", "sprint", "status"],
  issues: ["pod", "quarter", "sprintStatus", "sprint"],
};

const BASE_DEFAULT = {
  pod: ["all"],
  quarter: ["all"],
  sprint: ["all"],
  sprintStatus: "all" as "all" | "open" | "closed",
};
const EXTRA_DEFAULT = { developer: ["all"], status: "all" };

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState("executive");
  const [baseFilters, setBaseFilters] = useState(BASE_DEFAULT);
  const [extraFilters, setExtraFilters] = useState<
    Record<string, typeof EXTRA_DEFAULT>
  >(() => Object.fromEntries(TABS.map((t) => [t.id, { ...EXTRA_DEFAULT }])));

  const [feed, setFeed] = useState<RawFeedPayload | null>(null);
  const [zephyrLoading, setZephyrLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState<DashboardLoadingStage>("connecting");
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [feedRequestComplete, setFeedRequestComplete] = useState(false);
  const [loadFailure, setLoadFailure] = useState<DashboardLoadFailure | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [issueModal, setIssueModal] = useState<{
    title: string;
    subtitle: string;
    issues: IssueRow[];
  } | null>(null);

  // Tabs without a sprint filter always look at the whole window.
  const effectiveSprint = TAB_FILTERS[activeTab]?.includes("sprint")
    ? baseFilters.sprint
    : "all";

  useEffect(() => {
    console.info("[DASHBOARD_INIT] Client started", {
      runtime: window.self !== window.top ? "forge" : "local",
      route: window.location.pathname,
    });
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isLoading) return;
    const timer = window.setTimeout(() => setLoadingTimedOut(true), 15_000);
    return () => window.clearTimeout(timer);
  }, [isLoading, reloadKey]);

  // Dropdown sources are scoped to the selected pod/quarter (sprint excluded)
  // so the sprint list shows the pod's own sprints, not other pods'.
  const dropdownData: DashboardData | null = useMemo(() => {
    if (!feed || !Array.isArray(feed.items)) return null;
    return computeDashboardData(
      feed.items,
      {
        podId: baseFilters.pod,
        quarterId: baseFilters.quarter,
        sprintId: "all",
        sprintStatus: baseFilters.sprintStatus,
      },
      feed.sprintMeta,
      feed.config,
      feed.zephyr
    );
  }, [feed, baseFilters.pod, baseFilters.quarter, baseFilters.sprintStatus]);

  const dashboardData: DashboardData | null = useMemo(() => {
    if (!feed || !Array.isArray(feed.items)) return null;
    return {
      ...computeDashboardData(
        feed.items,
        {
          podId: baseFilters.pod,
          quarterId: baseFilters.quarter,
          sprintId: effectiveSprint,
          sprintStatus: TAB_FILTERS[activeTab]?.includes("sprintStatus") ? baseFilters.sprintStatus : "all",
        },
        feed.sprintMeta,
        feed.config,
        feed.zephyr
      ),
      jiraBaseUrl: feed.jiraBaseUrl,
    };
  }, [feed, baseFilters.pod, baseFilters.quarter, baseFilters.sprintStatus, effectiveSprint, activeTab]);

  const feedAgeMin = feed
    ? Math.max(0, Math.round((now - feed.fetchedAt) / 60000))
    : 0;

  const filterKeys = TAB_FILTERS[activeTab] || [];
  const filters: FilterState = {
    ...baseFilters,
    ...extraFilters[activeTab],
  };
  useEffect(() => {
    let cancelled = false;

    async function loadRaw(hard: boolean) {
      // Tab copy: an instant restore so refresh never waits when fresh.
      const cached = hard ? null : readSessionRawFeed();
      let requestCompleted = false;
      setLoadingStage("connecting");
      setLoadingTimedOut(false);
      setFeedRequestComplete(false);
      setLoadFailure(null);
      setRefreshing(false);
      if (cached) {
        setFeed(cached);
        setIsLoading(false);
        if (isRawFeedStale(cached)) setRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const next = await fetchRawFeed(hard, (stage) => {
          if (!cancelled) setLoadingStage(stage);
        });
        if (!next || !Array.isArray(next.items)) {
          throw new Error("Raw feed response is missing its items array.");
        }
        if (cancelled) return;
        console.info("[JIRA_FETCH] Feed accepted", {
          source: next.source,
          itemCount: next.items.length,
          defectCount: next.qaDefects?.length ?? 0,
          sprintCount: Object.keys(next.sprintMeta ?? {}).length,
        });
        if (next.zephyr) {
          console.info("[ZEPHYR_FETCH] Feed accepted", {
            available: next.zephyr.available,
            caseCount: next.zephyr.testCasesTotal ?? next.zephyr.cases?.length ?? 0,
            executionCount: next.zephyr.testExecutionsTotal ?? 0,
            hasMessage: Boolean(next.zephyr.message),
          });
        }
        writeSessionRawFeed(next);
        setFeed(next);
        const localRuntime = window.self === window.top;
        // Forge's raw Jira resolver deliberately excludes Zephyr. Request it
        // independently so slow Zephyr calls cannot time out the dashboard.
        const shouldLoadZephyrSeparately = !localRuntime ||
          hard || !next.zephyr || isRawFeedStale(next);
        setZephyrLoading(shouldLoadZephyrSeparately);
        if (shouldLoadZephyrSeparately) {
          void fetchZephyrData(hard).then((zephyr) => {
            if (cancelled) return;
            setFeed((current) => {
              if (!current) return current;
              const updated = { ...current, zephyr };
              writeSessionRawFeed(updated);
              return updated;
            });
          }).catch((error) => {
            if (cancelled) return;
            const message = error instanceof Error ? error.message : "Zephyr data could not be loaded.";
            console.error("[ZEPHYR_FETCH] Background request failed", message);
            setFeed((current) => current ? {
              ...current,
              zephyr: { available: false, message },
            } : current);
          }).finally(() => {
            if (!cancelled) setZephyrLoading(false);
          });
        }
        setLoadingStage("metrics");
        setFeedRequestComplete(true);
        setRefreshing(false);
        requestCompleted = true;
      } catch (err) {
        const failure = getDashboardLoadFailure(err);
        console.error("[DASHBOARD_LOAD] Request failed", failure);
        if (!cancelled) {
          setLoadFailure(failure);
        }
        // Never blank the tab on refresh failure: keep the copy on screen.
        if (!cached) {
          setFeed(null);
        }
        setZephyrLoading(false);
        setRefreshing(false);
      } finally {
        if (!cancelled && !requestCompleted) setIsLoading(false);
      }
    }

    loadRaw(reloadKey > 0);

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (
      !isLoading ||
      !feedRequestComplete ||
      loadFailure ||
      !feed ||
      !dashboardData ||
      !dropdownData
    ) return;

    let zephyrFrame = 0;
    let prepareFrame = 0;
    let readyFrame = 0;
    zephyrFrame = window.requestAnimationFrame(() => {
      setLoadingStage("zephyr");
      prepareFrame = window.requestAnimationFrame(() => {
        setLoadingStage("preparing");
        readyFrame = window.requestAnimationFrame(() => {
          console.info("[DASHBOARD_READY] Dashboard prepared", {
            source: feed.source,
            itemCount: feed.items.length,
            totalIssues: dashboardData.summary.totalIssues,
            chartsReady: true,
          });
          setIsLoading(false);
        });
      });
    });
    return () => {
      window.cancelAnimationFrame(zephyrFrame);
      window.cancelAnimationFrame(prepareFrame);
      if (readyFrame) window.cancelAnimationFrame(readyFrame);
    };
  }, [isLoading, feedRequestComplete, loadFailure, feed, dashboardData, dropdownData]);

  const updateFilter = (key: FilterKey, value: FilterValue) => {
    if (key === "sprintStatus") {
      if (value !== "all" && value !== "open" && value !== "closed") return;
      setBaseFilters((prev) => ({ ...prev, sprintStatus: value, sprint: ["all"] }));
    } else if (key === "pod" || key === "quarter" || key === "sprint") {
      const selected = Array.isArray(value) ? value : [value];
      setBaseFilters((prev) => ({
        ...prev,
        [key]: selected,
        ...(key === "pod" || key === "quarter" ? { sprint: ["all"] } : {}),
      }));
    } else if (key === "developer") {
      const selected = Array.isArray(value) ? value : [value];
      setExtraFilters((prev) => ({
        ...prev,
        [activeTab]: { ...prev[activeTab], developer: selected },
      }));
    } else {
      if (Array.isArray(value)) return;
      setExtraFilters((prev) => ({
        ...prev,
        [activeTab]: { ...prev[activeTab], status: value },
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
  const quarters = dropdownData?.quarters || [];
  const sprints = dropdownData?.sprints || []
  const metrics = dashboardData?.metrics || [];
  const selectedPodName = baseFilters.pod.includes("all")
    ? "All Pods"
    : baseFilters.pod.length
      ? baseFilters.pod.map((id) => pods.find((pod) => pod.id === id)?.name || id).join(", ")
      : "No Pods";
  const selectedQuarterName = baseFilters.quarter.includes("all")
    ? "All Quarters"
    : baseFilters.quarter.length
      ? baseFilters.quarter.map((id) => quarters.find((quarter) => quarter.id === id)?.name || id).join(", ")
      : "No Quarters";
  const selectedSprintName = baseFilters.sprint.includes("all")
    ? "All Sprints"
    : baseFilters.sprint.length
      ? baseFilters.sprint.map((id) => sprints.find((sprint) => sprint.id === id)?.name || id).join(", ")
      : "No Sprints";
  const scopeLabel =
    [
      selectedPodName,
      selectedQuarterName,
      selectedSprintName,
      baseFilters.sprintStatus === "open" ? "Open Sprints" : baseFilters.sprintStatus === "closed" ? "Closed Sprints" : "",
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
        issues = all.filter((i) => i.carriedInScope);
        label = "Not accepted / spilled-over committed work";
        break;
      case "Avg. Sprint Velocity":
      case "Velocity":
      case "Total Sprint Velocity":
        issues = all.filter((i) => i.completedInScope);
        label = "Completed work items";
        break;
      case "Say/Do Ratio":
        issues = all.filter((i) => i.completedInScope);
        label = "Accepted / completed committed work";
        break;
      case "Feature Predictability":
        // The card computes over the scope-aware feature pool (features often
        // lack sprint/quarter of their own), so the popup must read the same
        // pool, not issueList — otherwise it shows "No work items".
        issues = dashboardData.podFeatureList ?? all;
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
    sprintStatus: [
      { id: "all", name: "Any Sprint Status" },
      { id: "open", name: "Open Sprints", sub: "Active and upcoming" },
      { id: "closed", name: "Closed Sprints", sub: "Completed sprints" },
    ],
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

  const dashboardNavigation = (
    <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />
  );

  if (loadFailure && !feed) {
    return (
      <DashboardLayout navigation={dashboardNavigation}>
        <DashboardLoadErrorPanel
          failure={loadFailure}
          onRetry={() => setReloadKey((key) => key + 1)}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout navigation={dashboardNavigation}>
      {isLoading && (
        <DashboardLoadingOverlay stage={loadingStage} timedOut={loadingTimedOut} />
      )}
      <div className="dashboard-workspace space-y-6">
        {loadFailure && (
          <DashboardLoadErrorPanel
            failure={loadFailure}
            onRetry={() => setReloadKey((key) => key + 1)}
          />
        )}

        {/* Per-tab filters (Pod/Quarter/Sprint carry over between tabs) */}
        <TabFilters
          keys={filterKeys}
          title={TABS.find((t) => t.id === activeTab)?.label}
          value={filters}
          options={filterOptions}
          onChange={updateFilter}
          onReset={resetFilters}
          snapshot={dashboardData && (
            <div
              role="group"
              aria-label="Dashboard snapshot"
              className="inline-flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-jira-blue/20 bg-jira-blue-bg/70 px-3 py-1.5 text-xs text-jira-blue sm:gap-x-4"
            >
              <span className="whitespace-nowrap">
                <span className="font-medium">Work Items</span>{" "}
                <strong className="tabular-nums">{dashboardData.summary.totalIssues.toLocaleString()}</strong>
              </span>
              <span className="whitespace-nowrap">
                <span className="font-medium">SP Tracked</span>{" "}
                <strong className="tabular-nums">{dashboardData.summary.totalStoryPoints.toLocaleString()}</strong>
              </span>
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span className={`h-1.5 w-1.5 rounded-full ${refreshing ? "animate-pulse bg-jira-blue" : "bg-jira-green"}`} />
                <span className="font-medium">{refreshing ? "Updating" : "Snapshot"}</span>
                {!refreshing && feed && <strong>{feedAgeMin}m{feed.source === "jira-live" ? " · Fresh" : ""}</strong>}
              </span>
            </div>
          )}
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
                  <TrendsCharts
                    data={dashboardData.trends}
                    delivery={dashboardData.delivery}
                  />
                </>
              )}
            </div>
          )}

          {activeTab === "pod" && dashboardData && (
            <PodTab data={dashboardData} podName={selectedPodName} items={feed?.items ?? []} doneStatuses={feed?.config?.doneStatuses ?? []} />
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
              qaCapacity={dashboardData.qaCapacity}
              qaRosterConfigured={feed?.config?.qaMembers?.length ?? 0}
              zephyr={dashboardData.zephyr}
              zephyrLoading={zephyrLoading}
              issues={dashboardData.issueList}
              qualityItems={feed?.items?.filter((item) => !/^cancel{1,2}ed$/i.test(item.status.trim()))}
              doneStatuses={feed?.config?.doneStatuses}
              qaDefects={feed?.qaDefects ?? []}
              qaUatDefects={feed?.qaUatDefects}
              qaLeakageDefects={feed?.qaLeakageDefects}
              fetchedAt={feed?.fetchedAt}
              jiraDomain={dashboardData.jiraBaseUrl}
            />
          )}

          {activeTab === "diagnosis" && dashboardData && (
            <DiagnosisTab
              data={dashboardData.diagnosis}
              podName={selectedPodName}
              jiraDomain={dashboardData.jiraBaseUrl}
              statusFilter={filters.status}
              scopeLabel={scopeLabel}
            />
          )}

          {activeTab === "issues" && dashboardData && (
            <IssuesTab
              issues={dashboardData.issueList}
              auditItems={feed?.items ?? []}
              filters={{ podId: baseFilters.pod, quarterId: baseFilters.quarter, sprintId: baseFilters.sprint, sprintStatus: baseFilters.sprintStatus }}
              sprintMeta={feed?.sprintMeta}
              jiraDomain={dashboardData.jiraBaseUrl}
            />
          )}
        </div>

        {issueModal?.title === "Feature Predictability" && dashboardData ? (
          <FeatureDetailsModal features={issueModal.issues} items={feed?.items ?? []} doneStatuses={feed?.config?.doneStatuses ?? []} jiraDomain={dashboardData.jiraBaseUrl} onClose={() => setIssueModal(null)} />
        ) : issueModal && dashboardData && (
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

"use client";

import { useEffect, useRef, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Dropdown } from "@/components/Dropdown";
import { TabBar } from "@/components/TabBar";
import { MetricCard } from "@/components/MetricCard";
import { VelocityGrid } from "@/components/VelocityGrid";
import { fetchDashboardData } from "@/lib/api";
import { DashboardData } from "@/lib/jira/types";
import { PodTab } from "@/components/tabs/PodTab";
import { DeveloperTab } from "@/components/tabs/DeveloperTab";
import { SprintAnalysisTab } from "@/components/tabs/SprintAnalysisTab";
import { QualityTab } from "@/components/tabs/QualityTab";
import { PredictabilityTab } from "@/components/tabs/PredictabilityTab";
import { TrendsTab } from "@/components/tabs/TrendsTab";
import { DiagnosisTab } from "@/components/tabs/DiagnosisTab";
import { IssuesTab } from "@/components/tabs/IssuesTab";

const TABS = [
  { id: "executive", label: "Executive Summary" },
  { id: "pod", label: "Pod View" },
  { id: "developer", label: "Developer View" },
  { id: "sprint", label: "Sprint Analysis" },
  { id: "quality", label: "Quality" },
  { id: "predictability", label: "Predictability" },
  { id: "diagnosis", label: "Delivery Diagnosis" },
  { id: "trends", label: "Trends" },
  { id: "issues", label: "Issues" },
];

export default function DashboardPage() {
  const [selectedPod, setSelectedPod] = useState("all");
  const [selectedQuarter, setSelectedQuarter] = useState("all");
  const [selectedSprint, setSelectedSprint] = useState("all");

  const [servicesOpen, setServicesOpen] = useState(false);
  const [quartersOpen, setQuartersOpen] = useState(false);
  const [sprintsOpen, setSprintsOpen] = useState(false);

  const [activeTab, setActiveTab] = useState("executive");
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const servicesRef = useRef<HTMLDivElement>(null);
  const quartersRef = useRef<HTMLDivElement>(null);
  const sprintsRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (servicesRef.current && !servicesRef.current.contains(e.target as Node)) {
        setServicesOpen(false);
      }
      if (quartersRef.current && !quartersRef.current.contains(e.target as Node)) {
        setQuartersOpen(false);
      }
      if (sprintsRef.current && !sprintsRef.current.contains(e.target as Node)) {
        setSprintsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch dynamic Jira metrics when filters change
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setIsLoading(true);
      try {
        const data = await fetchDashboardData({
          podId: selectedPod,
          quarterId: selectedQuarter,
          sprintId: selectedSprint,
        });
        if (!cancelled) {
          setDashboardData(data);
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
        if (!cancelled) setIsLoading(false);
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, [selectedPod, selectedQuarter, selectedSprint]);

  const pods = dashboardData?.pods || [];

  const quarters = dashboardData?.quarters || [];

  const sprints = dashboardData?.sprints || [];

  const metrics = dashboardData?.metrics || [];
  const selectedPodName = pods.find((p) => p.id === selectedPod)?.name || "All Pods";

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

        {/* Filter bar: Pods / Quarter / Sprints */}
        <div className="bg-white border border-jira-border rounded-lg p-4 grid grid-cols-1 md:grid-cols-3 gap-4 shadow-sm">
          <div className="min-w-0" ref={servicesRef}>
            <Dropdown
              label="Services / Pods"
              items={pods.map((p) => ({ id: p.id, name: p.name, sub: p.sub }))}
              onChange={(id) => {
                setSelectedPod(id);
                setServicesOpen(false);
              }}
              value={selectedPod}
              open={servicesOpen}
              onToggle={(open) => {
                setServicesOpen(open);
                if (open) {
                  setQuartersOpen(false);
                  setSprintsOpen(false);
                }
              }}
            />
          </div>

          <div className="min-w-0" ref={quartersRef}>
            <Dropdown
              label="Quarter / PI"
              items={quarters.map((q) => ({ id: q.id, name: q.name, sub: q.sub }))}
              onChange={(id) => {
                setSelectedQuarter(id);
                setQuartersOpen(false);
              }}
              value={selectedQuarter}
              open={quartersOpen}
              onToggle={(open) => {
                setQuartersOpen(open);
                if (open) {
                  setServicesOpen(false);
                  setSprintsOpen(false);
                }
              }}
            />
          </div>

          <div className="min-w-0" ref={sprintsRef}>
            <Dropdown
              label="Sprint"
              items={sprints.map((s) => ({ id: s.id, name: s.name, sub: s.sub }))}
              onChange={(id) => {
                setSelectedSprint(id);
                setSprintsOpen(false);
              }}
              value={selectedSprint}
              open={sprintsOpen}
              onToggle={(open) => {
                setSprintsOpen(open);
                if (open) {
                  setServicesOpen(false);
                  setQuartersOpen(false);
                }
              }}
            />
          </div>
        </div>

        {/* Tab Navigation */}
        <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />

        {/* Loading Indicator Overlay */}
        <div className={`transition-opacity duration-200 ${isLoading ? "opacity-60 pointer-events-none" : "opacity-100"}`}>
          {/* Executive Summary Tab */}
          {activeTab === "executive" && (
            <div className="space-y-6">
              {/* Dynamic KPI Metric Cards */}
              <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {metrics.map((card) => (
                  <MetricCard
                    key={card.title}
                    {...card}
                    onOpen={
                      card.drilldownTab
                        ? () => {
                            setActiveTab(card.drilldownTab!);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }
                        : undefined
                    }
                  />
                ))}
              </section>

              {/* Dynamic Velocity & Delivery Charts */}
              {dashboardData && (
                <VelocityGrid
                  velocity={dashboardData.velocity}
                  delivery={dashboardData.delivery}
                />
              )}
            </div>
          )}

          {/* Pod View Tab */}
          {activeTab === "pod" && dashboardData && (
            <PodTab data={dashboardData} podName={selectedPodName} />
          )}

          {/* Developer View Tab */}
          {activeTab === "developer" && dashboardData && (
            <DeveloperTab developers={dashboardData.developers} podName={selectedPodName} />
          )}

          {/* Sprint Analysis Tab */}
          {activeTab === "sprint" && dashboardData && (
            <SprintAnalysisTab data={dashboardData.sprintAnalysis} />
          )}

          {/* Quality Tab */}
          {activeTab === "quality" && dashboardData && (
            <QualityTab data={dashboardData.quality} />
          )}

          {/* Predictability Tab */}
          {activeTab === "predictability" && dashboardData && (
            <PredictabilityTab data={dashboardData.predictability} />
          )}

          {/* Delivery Diagnosis Tab */}
          {activeTab === "diagnosis" && dashboardData && (
            <DiagnosisTab
              data={dashboardData.diagnosis}
              podName={selectedPodName}
              jiraDomain={dashboardData.jiraBaseUrl}
            />
          )}

          {/* Trends Tab */}
          {activeTab === "trends" && dashboardData && (
            <TrendsTab data={dashboardData.trends} podName={selectedPodName} />
          )}

          {/* Issues Tab */}
          {activeTab === "issues" && dashboardData && (
            <IssuesTab
              issues={dashboardData.issueList}
              podName={selectedPodName}
              jiraDomain={dashboardData.jiraBaseUrl}
            />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

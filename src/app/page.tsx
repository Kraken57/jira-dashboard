"use client";

import { useEffect, useRef, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Dropdown } from "@/components/Dropdown";
import { TabBar } from "@/components/TabBar";
import { MetricCard } from "@/components/MetricCard";
import { VelocityGrid } from "@/components/VelocityGrid";
import { PODS, SPRINTS, EXECUTIVE_METRICS } from "@/lib/mockData";

const TABS = [
  { id: "executive", label: "Executive Summary" },
  { id: "pod", label: "Pod View" },
  { id: "developer", label: "Developer View" },
  { id: "sprint", label: "Sprint Analysis" },
  { id: "quality", label: "Quality" },
  { id: "predictability", label: "Predictability" },
  { id: "trends", label: "Trends" },
  { id: "issues", label: "Issues" },
];

export default function DashboardPage() {
  const [selectedPod, setSelectedPod] = useState("all");
  const [selectedSprint, setSelectedSprint] = useState("all");
  const [servicesOpen, setServicesOpen] = useState(false);
  const [sprintsOpen, setSprintsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("executive");

  const servicesRef = useRef<HTMLDivElement>(null);
  const sprintsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (servicesRef.current && !servicesRef.current.contains(e.target as Node)) {
        setServicesOpen(false);
      }
      if (sprintsRef.current && !sprintsRef.current.contains(e.target as Node)) {
        setSprintsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page heading */}
        <div className="mb-2">
          <h1 className="text-lg font-bold text-jira-text tracking-tight">
            Enterprise Sprint Performance
          </h1>
          <p className="text-sm text-jira-text-muted mt-1">
            End of Sprint Summary and Delivery Insights
          </p>
        </div>

        {/* Filter bar */}
        <div className="bg-white border border-jira-border rounded-lg p-4 flex flex-col md:flex-row items-end gap-4">
          <div className="flex-1 min-w-0" ref={servicesRef}>
            <Dropdown
              label="Services"
              items={PODS.map((p) => ({ id: p.id, name: p.name, sub: `${p.teamCount} teams` }))}
              onChange={setSelectedPod}
              value={selectedPod}
              open={servicesOpen}
              onToggle={(open) => {
                setServicesOpen(open);
                if (open) setSprintsOpen(false);
              }}
            />
          </div>
          <div className="flex-1 min-w-0" ref={sprintsRef}>
            <Dropdown
              label="Sprint"
              items={SPRINTS.map((s) => ({ id: s.id, name: s.name, sub: s.team }))}
              onChange={setSelectedSprint}
              value={selectedSprint}
              open={sprintsOpen}
              onToggle={(open) => {
                setSprintsOpen(open);
                if (open) setServicesOpen(false);
              }}
            />
          </div>
        </div>

        {/* Tabs */}
        <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />

        {/* Executive Summary metrics */}
        {activeTab === "executive" && (
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {EXECUTIVE_METRICS.map((card) => (
              <MetricCard key={card.title} {...card} />
            ))}
          </section>
        )}

        {/* Velocity grid (stats + histograms) */}
        {activeTab === "executive" && <VelocityGrid />}

        {/* Placeholder for other tabs */}
        {activeTab !== "executive" && (
          <div className="bg-white border border-jira-border rounded-lg p-8 text-center text-jira-text-muted">
            {activeTab === "pod" ? "Pod View — select a service above to see team-level metrics." : `${TABS.find((t) => t.id === activeTab)?.label} — view coming soon.`}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

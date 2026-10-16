"use client";

import { Bar, Chart } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend, LineElement, PointElement } from "chart.js";
import { SPRINTS } from "@/lib/mockData";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend, LineElement, PointElement);

const COLORS = {
  planned: "#0052cc",
  committed: "#c03a2b",
  done: "#0e7c3e",
  carried: "#f2a900",
};

const PROGRESS_COLORS = ["#0052cc", "#c03a2b", "#0e7c3e", "#f2a900", "#585f6b", "#0066cc", "#d22f27", "#36b37e"];

function StatRow({ label, value, sub, color, pct }: { label: string; value: string | number; sub?: string; color: string; pct: number }) {
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span className="w-24 flex-shrink-0 text-xs font-medium text-jira-text">{label}</span>
      <span className="w-10 text-right text-xs font-bold text-jira-text">{value}</span>
      <div className="flex-1 h-1.5 bg-jira-bg/50 rounded overflow-hidden">
        <div className={`h-full rounded`} style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      {sub && <span className="ml-2 text-[10px] text-jira-text-light">{sub}</span>}
    </div>
  );
}

function DeliveryChart({ labels, planned, committed, done, carried }: { labels: string[]; planned: number[]; committed: number[]; done: number[]; carried: number[] }) {
  return (
    <div className="bg-white border border-jira-border rounded-lg p-3">
      <h3 className="text-xs font-bold text-jira-text mb-2 uppercase tracking-wider">
        Sprint Delivery Overview
      </h3>
      <div className="h-36 overflow-x-auto min-w-0">
        <Bar
          data={{
            labels,
            datasets: [
              { label: "Planned", data: planned, backgroundColor: COLORS.planned, borderRadius: 2, barPercentage: 0.5, categoryPercentage: 0.7 },
              { label: "Committed", data: committed, backgroundColor: COLORS.committed, borderRadius: 2, barPercentage: 0.5, categoryPercentage: 0.7 },
              { label: "Done", data: done, backgroundColor: COLORS.done, borderRadius: 2, barPercentage: 0.5, categoryPercentage: 0.7 },
              { label: "Carried Over", data: carried, backgroundColor: COLORS.carried, borderRadius: 2, barPercentage: 0.5, categoryPercentage: 0.7 },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: "top", labels: { font: { size: 9 }, color: "#585f6b", padding: 6 } },
              tooltip: { mode: "index", intersect: false, titleFont: { size: 10 }, bodyFont: { size: 11 } },
            },
            interaction: { mode: "index", intersect: false },
            scales: {
              y: { beginAtZero: true, ticks: { stepSize: 10, font: { size: 9 }, color: "#585f6b" }, grid: { color: "#e8eaed" } },
              x: { ticks: { font: { size: 9 }, color: "#585f6b" }, grid: { display: false } },
            },
          }}
        />
      </div>
    </div>
  );
}

function VelocityChart() {
  const completed = SPRINTS.map((s) => s.storyPoints.completed);
  const committedSP = SPRINTS.map((s) => s.storyPoints.committed);
  const labels = SPRINTS.map((s) => s.name);
  const totalFinished = completed.reduce((a, b) => a + b, 0);
  const lastThree = completed.slice(Math.max(completed.length - 3, 0));
  const avgLastThree = lastThree.reduce((a, b) => a + b, 0) / lastThree.length;
  const trend = completed.length >= 2 ? completed[completed.length - 1] - completed[completed.length - 2] : 0;
  const rising = trend > 0;
  const falling = trend < 0;

  return (
    <div className="mt-2 bg-white border border-jira-border rounded-lg p-3 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-jira-text uppercase tracking-wider">Team Velocity</h3>
        <div className={`flex items-center gap-1 text-xs font-bold ${rising ? "text-jira-green" : falling ? "text-jira-red" : "text-jira-text-muted"}`}>
          <span className={`w-2 h-2 rounded-full ${rising ? "bg-jira-green animate-pulse" : falling ? "bg-jira-red animate-pulse" : "bg-jira-text-light"}`} />
          <span>{rising ? "Rising" : falling ? "Falling" : "Stable"} vs last sprint</span>
        </div>
        <span className="text-xs font-bold text-jira-text">{totalFinished} SP finished</span>
      </div>
      <p className="text-[10px] text-jira-text-light mb-2">Average last 3 sprints: {avgLastThree.toFixed(1)} SP</p>
      <div className="flex-1 min-h-[180px] overflow-x-auto min-w-0">
        <Chart
          type="bar"
          data={{
            labels,
            datasets: [
              {
                label: "Velocity (Done SP)",
                data: completed,
                backgroundColor: COLORS.done,
                borderRadius: 3,
                barPercentage: 0.5,
                categoryPercentage: 0.7,
              },
              {
                label: "Committed SP",
                data: committedSP,
                type: "line",
                borderColor: COLORS.committed,
                borderWidth: 2,
                borderDash: [5, 5],
                pointRadius: 4,
                pointBackgroundColor: COLORS.committed,
                pointBorderColor: "#ffffff",
                pointBorderWidth: 2,
                fill: false,
                tension: 0,
                yAxisID: "y",
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: "top", labels: { font: { size: 9 }, color: "#585f6b", padding: 6 } },
              tooltip: { mode: "index", intersect: false, titleFont: { size: 10 }, bodyFont: { size: 11 } },
            },
            interaction: { mode: "index", intersect: false },
            scales: {
              y: {
                beginAtZero: true,
                ticks: { stepSize: 10, font: { size: 9 }, color: "#585f6b" },
                grid: { color: "#e8eaed" },
                title: { display: true, text: "Story Points", font: { size: 10, weight: "bold" }, color: "#262f38" },
              },
              x: { ticks: { font: { size: 9 }, color: "#585f6b" }, grid: { display: false } },
            },
          }}
        />
      </div>
    </div>
  );
}

export function VelocityGrid() {
  const labels = SPRINTS.map((s) => s.name);
  const planned = SPRINTS.map((s) => s.storyPoints.planned);
  const committed = SPRINTS.map((s) => s.storyPoints.committed);
  const done = SPRINTS.map((s) => s.storyPoints.completed);
  const carried = SPRINTS.map((s) => s.storyPoints.carriedOver);

  const totalCommittedStories = SPRINTS.reduce((a, s) => a + s.stories.committed, 0);
  const totalCompletedStories = SPRINTS.reduce((a, s) => a + s.stories.completed, 0);
  const totalCarriedStories = SPRINTS.reduce((a, s) => a + s.stories.carriedOver, 0);
  const totalAdded = SPRINTS.reduce((a, s) => a + s.stories.added, 0);
  const totalRemoved = SPRINTS.reduce((a, s) => a + s.stories.removed, 0);
  const totalCommittedSP = SPRINTS.reduce((a, s) => a + s.storyPoints.committed, 0);
  const totalCompletedSP = SPRINTS.reduce((a, s) => a + s.storyPoints.completed, 0);
  const totalCarriedSP = SPRINTS.reduce((a, s) => a + s.storyPoints.carriedOver, 0);
  const netScopeChange = totalAdded - totalRemoved;

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
      {/* Left: Totals analysis with inline progress bars */}
      <div className="md:col-span-6">
        <div className="bg-white border border-jira-border rounded-lg p-3">
          <h3 className="text-xs font-bold text-jira-text mb-3 uppercase tracking-wider">
            Sprint Totals Analysis
          </h3>
          <div className="space-y-2">
            <StatRow label="Committed Stories" value={totalCommittedStories} color={PROGRESS_COLORS[0]} pct={100} />
            <StatRow label="Completed Stories" value={totalCompletedStories} color={PROGRESS_COLORS[1]} pct={Math.round((totalCompletedStories / totalCommittedStories) * 100)} sub="done rate" />
            <StatRow label="Carried Over Stories" value={totalCarriedStories} color={PROGRESS_COLORS[2]} pct={Math.round((totalCarriedStories / totalCommittedStories) * 100)} sub="carry rate" />
            <StatRow label="Added During Sprint" value={totalAdded} color={PROGRESS_COLORS[3]} pct={50} sub="scope added" />
            <StatRow label="Removed During Sprint" value={totalRemoved} color={PROGRESS_COLORS[4]} pct={30} sub="scope removed" />
            <StatRow label="Committed Story Points" value={totalCommittedSP} color={PROGRESS_COLORS[5]} pct={100} sub="committed SP" />
            <StatRow label="Completed Story Points" value={totalCompletedSP} color={PROGRESS_COLORS[6]} pct={Math.round((totalCompletedSP / totalCommittedSP) * 100)} sub="done rate" />
            <StatRow label="Carried Over Story Points" value={totalCarriedSP} color={PROGRESS_COLORS[7]} pct={Math.round((totalCarriedSP / totalCommittedSP) * 100)} sub="carry rate" />
            <StatRow label="Net Scope Change" value={netScopeChange} color={netScopeChange >= 0 ? "#0e7c3e" : "#c03a2b"} pct={50} sub="added minus removed" />
          </div>
        </div>
      </div>

      {/* Right: Delivery chart stacked on top of Velocity chart */}
      <div className="md:col-span-6 flex flex-col gap-3">
        <DeliveryChart labels={labels} planned={planned} committed={committed} done={done} carried={carried} />
        <VelocityChart />
      </div>
    </div>
  );
}

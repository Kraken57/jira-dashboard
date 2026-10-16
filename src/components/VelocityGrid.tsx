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
    <div className="bg-white border border-jira-border rounded-lg p-3 flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-jira-text uppercase tracking-wider">Team Velocity</h3>
        <div className={`flex items-center gap-1 text-xs font-bold ${rising ? "text-jira-green" : falling ? "text-jira-red" : "text-jira-text-muted"}`}>
          <span className={`w-2 h-2 rounded-full ${rising ? "bg-jira-green animate-pulse" : falling ? "bg-jira-red animate-pulse" : "bg-jira-text-light"}`} />
          <span>{rising ? "Rising" : falling ? "Falling" : "Stable"} vs last sprint</span>
        </div>
        <span className="text-xs font-bold text-jira-text">{totalFinished} SP finished</span>
      </div>
      <p className="text-[10px] text-jira-text-light mb-2">Average last 3 sprints: {avgLastThree.toFixed(1)} SP</p>
      <div className="h-48 overflow-x-auto min-w-0">
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
                showLine: true,
                borderColor: COLORS.committed,
                borderWidth: 2,
                borderDash: [6, 4],
                pointRadius: 4,
                pointBackgroundColor: COLORS.committed,
                pointBorderColor: "#ffffff",
                pointBorderWidth: 2,
                pointStyle: "circle",
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
              },
              x: { ticks: { font: { size: 9 }, color: "#585f6b" }, grid: { display: false } },
            },
          }}
        />
      </div>
    </div>
  );
}

function DeliveryChart({ labels, planned, committed, done, carried }: { labels: string[]; planned: number[]; committed: number[]; done: number[]; carried: number[] }) {
  return (
    <div className="bg-white border border-jira-border rounded-lg p-3 flex flex-col h-full">
      <h3 className="text-sm font-bold text-jira-text mb-2 uppercase tracking-wider">
        Sprint Delivery Overview
      </h3>
      <div className="h-48 overflow-x-auto min-w-0">
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

export function VelocityGrid() {
  const labels = SPRINTS.map((s) => s.name);
  const planned = SPRINTS.map((s) => s.storyPoints.planned);
  const committed = SPRINTS.map((s) => s.storyPoints.committed);
  const done = SPRINTS.map((s) => s.storyPoints.completed);
  const carried = SPRINTS.map((s) => s.storyPoints.carriedOver);

  return (
    <div className="flex flex-col md:flex-row gap-4 min-w-0">
      {/* Left: Team Velocity */}
      <div className="flex-1 min-w-0">
        <VelocityChart />
      </div>

      {/* Right: Sprint Delivery Overview */}
      <div className="flex-1 min-w-0">
        <DeliveryChart labels={labels} planned={planned} committed={committed} done={done} carried={carried} />
      </div>
    </div>
  );
}

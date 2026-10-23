"use client";

import { useState } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { TrendsData } from "@/lib/jira/types";
import { DetailModal } from "@/components/DetailModal";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
);

interface TrendsTabProps {
  data: TrendsData;
  podName: string;
  windowSize?: number;
}

export function TrendsTab({ data, podName, windowSize }: TrendsTabProps) {
  const take = <T,>(arr: T[]) =>
    windowSize && windowSize > 0 ? arr.slice(-windowSize) : arr;

  const velocityTrend = {
    ...data.velocityTrend,
    labels: take(data.velocityTrend.labels),
    velocity: take(data.velocityTrend.velocity),
    movingAvg: take(data.velocityTrend.movingAvg),
  };
  const cumulativeThroughput = {
    ...data.cumulativeThroughput,
    labels: take(data.cumulativeThroughput.labels),
    totalIssues: take(data.cumulativeThroughput.totalIssues),
    completedIssues: take(data.cumulativeThroughput.completedIssues),
  };

  const velocities = velocityTrend.velocity;
  const peakVelocity = velocities.length > 0 ? Math.max(...velocities) : 0;
  const avgMoving =
    velocityTrend.movingAvg.length > 0
      ? velocityTrend.movingAvg[velocityTrend.movingAvg.length - 1]
      : 0;

  const totalCompletedIssues =
    cumulativeThroughput.completedIssues.length > 0
      ? cumulativeThroughput.completedIssues[cumulativeThroughput.completedIssues.length - 1]
      : 0;
  const totalTrackedIssues =
    cumulativeThroughput.totalIssues.length > 0
      ? cumulativeThroughput.totalIssues[cumulativeThroughput.totalIssues.length - 1]
      : 0;

  const completionPct =
    totalTrackedIssues > 0 ? Math.round((totalCompletedIssues / totalTrackedIssues) * 100) : 0;

  const [open, setOpen] = useState<"velocity" | "throughput" | null>(null);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => setOpen("velocity")}
          className="text-left bg-white border border-jira-border rounded-lg p-4 shadow-sm hover:border-jira-blue/50 transition"
        >
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Peak Velocity</p>
          <p className="text-2xl font-bold text-jira-text mt-1">{peakVelocity} SP</p>
          <p className="text-xs text-jira-text-light mt-1">Highest sprint output</p>
        </button>
        <button
          type="button"
          onClick={() => setOpen("velocity")}
          className="text-left bg-white border border-jira-border rounded-lg p-4 shadow-sm hover:border-jira-blue/50 transition"
        >
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Rolling Velocity</p>
          <p className="text-2xl font-bold text-jira-blue mt-1">{avgMoving} SP</p>
          <p className="text-xs text-jira-text-light mt-1">Multi-sprint moving average</p>
        </button>
        <button
          type="button"
          onClick={() => setOpen("throughput")}
          className="text-left bg-white border border-jira-border rounded-lg p-4 shadow-sm hover:border-jira-green/50 transition"
        >
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Cumulative Throughput</p>
          <p className="text-2xl font-bold text-jira-green mt-1">{totalCompletedIssues} Issues</p>
          <p className="text-xs text-jira-text-light mt-1">Shipped across recorded iterations</p>
        </button>
        <button
          type="button"
          onClick={() => setOpen("throughput")}
          className="text-left bg-white border border-jira-border rounded-lg p-4 shadow-sm hover:border-jira-green/50 transition"
        >
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Throughput Momentum</p>
          <p className="text-2xl font-bold text-jira-text mt-1">{completionPct}%</p>
          <p className="text-xs text-jira-text-light mt-1">Cumulative delivery rate for {podName}</p>
        </button>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Velocity Trajectory & Moving Average */}
        <div className="bg-white border border-jira-border rounded-lg p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-jira-text uppercase tracking-wider">
                Velocity Trajectory & Moving Average
              </h3>
              <p className="text-xs text-jira-text-muted mt-0.5">
                Story points delivered per sprint vs smoothed moving trend
              </p>
            </div>
          </div>
          <div className="h-64 min-w-0">
            <Line
              data={{
                labels: velocityTrend.labels,
                datasets: [
                  {
                    label: "Actual Velocity (SP)",
                    data: velocityTrend.velocity,
                    borderColor: "#0052cc",
                    backgroundColor: "rgba(0, 82, 204, 0.1)",
                    fill: true,
                    tension: 0.3,
                    borderWidth: 2,
                    pointRadius: 4,
                    pointBackgroundColor: "#0052cc",
                    pointBorderColor: "#ffffff",
                    pointBorderWidth: 2,
                  },
                  {
                    label: "Moving Average (SP)",
                    data: velocityTrend.movingAvg,
                    borderColor: "#0e7c3e",
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.3,
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: "#0e7c3e",
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: "top",
                    labels: { font: { size: 10 }, color: "#585f6b", padding: 8 },
                  },
                  tooltip: {
                    mode: "index",
                    intersect: false,
                  },
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    ticks: { font: { size: 10 }, color: "#585f6b" },
                    grid: { color: "#e8eaed" },
                  },
                  x: {
                    ticks: { font: { size: 10 }, color: "#585f6b" },
                    grid: { display: false },
                  },
                },
              }}
            />
          </div>
        </div>

        {/* Cumulative Work Item Throughput */}
        <div className="bg-white border border-jira-border rounded-lg p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-jira-text uppercase tracking-wider">
                Cumulative Throughput Growth
              </h3>
              <p className="text-xs text-jira-text-muted mt-0.5">
                Total work items accumulated vs completed over time
              </p>
            </div>
          </div>
          <div className="h-64 min-w-0">
            <Line
              data={{
                labels: cumulativeThroughput.labels,
                datasets: [
                  {
                    label: "Total Work Items",
                    data: cumulativeThroughput.totalIssues,
                    borderColor: "#585f6b",
                    backgroundColor: "rgba(88, 95, 107, 0.05)",
                    fill: true,
                    tension: 0.2,
                    borderWidth: 2,
                    pointRadius: 3,
                  },
                  {
                    label: "Completed Issues",
                    data: cumulativeThroughput.completedIssues,
                    borderColor: "#0e7c3e",
                    backgroundColor: "rgba(14, 124, 62, 0.1)",
                    fill: true,
                    tension: 0.2,
                    borderWidth: 2,
                    pointRadius: 4,
                    pointBackgroundColor: "#0e7c3e",
                    pointBorderColor: "#ffffff",
                    pointBorderWidth: 2,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: "top",
                    labels: { font: { size: 10 }, color: "#585f6b", padding: 8 },
                  },
                  tooltip: {
                    mode: "index",
                    intersect: false,
                  },
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    ticks: { font: { size: 10 }, color: "#585f6b" },
                    grid: { color: "#e8eaed" },
                  },
                  x: {
                    ticks: { font: { size: 10 }, color: "#585f6b" },
                    grid: { display: false },
                  },
                },
              }}
            />
          </div>
        </div>
      </div>

      {open && (
        <DetailModal
          title={open === "velocity" ? "Velocity Trajectory" : "Cumulative Throughput"}
          subtitle={`${podName} · ${velocityTrend.labels.length} sprints`}
          onClose={() => setOpen(null)}
        >
          <table className="w-full text-left text-sm">
            <thead className="bg-jira-bg text-jira-text-muted text-xs uppercase border-b border-jira-border font-semibold sticky top-0">
              <tr>
                <th className="px-5 py-2.5">Sprint</th>
                {open === "velocity" ? (
                  <>
                    <th className="px-5 py-2.5 text-right">Velocity</th>
                    <th className="px-5 py-2.5 text-right">Moving Avg</th>
                  </>
                ) : (
                  <>
                    <th className="px-5 py-2.5 text-right">Total Items</th>
                    <th className="px-5 py-2.5 text-right">Completed</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-jira-border/60">
              {velocityTrend.labels.map((label, i) => (
                <tr key={label}>
                  <td className="px-5 py-2.5 text-xs font-semibold">{label}</td>
                  {open === "velocity" ? (
                    <>
                      <td className="px-5 py-2.5 text-xs text-right">{velocityTrend.velocity[i]} SP</td>
                      <td className="px-5 py-2.5 text-xs text-right text-jira-green">
                        {velocityTrend.movingAvg[i]} SP
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-5 py-2.5 text-xs text-right">
                        {cumulativeThroughput.totalIssues[i]}
                      </td>
                      <td className="px-5 py-2.5 text-xs text-right text-jira-green">
                        {cumulativeThroughput.completedIssues[i]}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </DetailModal>
      )}
    </div>
  );
}


"use client";

import { Bar, Line } from "react-chartjs-2";
import type { ReactNode } from "react";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { DeliveryChartData, TrendsData } from "@/lib/jira/types";
import { SprintDeliveryChart } from "./VelocityGrid";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
);

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: "top" as const,
      labels: {
        font: { size: 10 },
        color: "#536174",
        padding: 12,
        usePointStyle: true,
        boxWidth: 8,
      },
    },
    tooltip: {
      mode: "index" as const,
      intersect: false,
      backgroundColor: "#172b4d",
      titleColor: "#ffffff",
      bodyColor: "#e8eef7",
      borderColor: "#334b6b",
      borderWidth: 1,
      padding: 12,
      cornerRadius: 10,
    },
  },
  interaction: { mode: "index" as const, intersect: false },
  scales: {
    y: {
      beginAtZero: true,
      ticks: { font: { size: 10 }, color: "#64748b", padding: 8 },
      grid: { color: "#edf1f6", drawTicks: false },
    },
    x: {
      ticks: { font: { size: 10 }, color: "#64748b", padding: 6 },
      grid: { display: false },
    },
  },
};

function ChartPanel({ title, description, children }: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="flex h-full flex-col rounded-lg border border-jira-border bg-white p-5 shadow-sm">
      <h3 className="text-sm font-bold uppercase tracking-wider text-jira-text">{title}</h3>
      <p className="mb-3 mt-1 text-xs text-jira-text-muted">{description}</p>
      <div className="h-64 min-w-0">{children}</div>
    </section>
  );
}

export function TrendsCharts({
  data,
  delivery,
}: {
  data: TrendsData;
  delivery: DeliveryChartData;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <SprintDeliveryChart data={delivery} />

      <ChartPanel
        title="Velocity Trajectory & Moving Average"
        description="Story points delivered per sprint and the expanding average trend"
      >
        <Line
          data={{
            labels: data.velocityTrend.labels,
            datasets: [
              {
                label: "Completed story points",
                data: data.velocityTrend.velocity,
                borderColor: "#0052cc",
                backgroundColor: "rgba(0, 82, 204, 0.1)",
                fill: true,
                tension: 0.3,
                borderWidth: 2.5,
                pointRadius: 3,
                pointHoverRadius: 6,
                pointBackgroundColor: "#0052cc",
                pointBorderColor: "#ffffff",
                pointBorderWidth: 2,
              },
              {
                label: "Moving average",
                data: data.velocityTrend.movingAvg,
                borderColor: "#0e7c3e",
                borderDash: [5, 5],
                fill: false,
                tension: 0.3,
                borderWidth: 2.5,
                pointRadius: 2,
                pointHoverRadius: 5,
                pointBackgroundColor: "#0e7c3e",
              },
            ],
          }}
          options={chartOptions}
        />
      </ChartPanel>

      <ChartPanel
        title="Cumulative Throughput Growth"
        description="Running total of tracked work items compared with completed items"
      >
        <Line
          data={{
            labels: data.cumulativeThroughput.labels,
            datasets: [
              {
                label: "Tracked work items",
                data: data.cumulativeThroughput.totalIssues,
                borderColor: "#585f6b",
                backgroundColor: "rgba(88, 95, 107, 0.05)",
                fill: true,
                tension: 0.2,
                borderWidth: 2.5,
                pointHoverRadius: 5,
                pointRadius: 3,
              },
              {
                label: "Completed work items",
                data: data.cumulativeThroughput.completedIssues,
                borderColor: "#0e7c3e",
                backgroundColor: "rgba(14, 124, 62, 0.1)",
                fill: true,
                tension: 0.2,
                borderWidth: 2.5,
                pointRadius: 3,
                pointHoverRadius: 6,
                pointBackgroundColor: "#0e7c3e",
                pointBorderColor: "#ffffff",
                pointBorderWidth: 2,
              },
            ],
          }}
          options={chartOptions}
        />
      </ChartPanel>

      <ChartPanel
        title="Features Completed by Sprint"
        description="A feature is counted when all of its child stories are complete"
      >
        <Bar
          data={{
            labels: data.featureCompletion.labels,
            datasets: [
              {
                label: "Completed features",
                data: data.featureCompletion.completedFeatures,
                backgroundColor: "#6554c0",
                borderRadius: 4,
                barPercentage: 0.55,
                categoryPercentage: 0.7,
              },
            ],
          }}
          options={{
            ...chartOptions,
            scales: {
              ...chartOptions.scales,
              y: {
                ...chartOptions.scales.y,
                ticks: {
                  ...chartOptions.scales.y.ticks,
                  precision: 0,
                  stepSize: 1,
                },
              },
            },
          }}
        />
      </ChartPanel>
    </div>
  );
}

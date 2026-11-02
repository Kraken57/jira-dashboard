"use client";

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

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
);

export function TrendsCharts({ data }: { data: TrendsData }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
              labels: data.velocityTrend.labels,
              datasets: [
                {
                  label: "Actual Velocity (SP)",
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
                  label: "Moving Average (SP)",
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
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: "top",
                  labels: { font: { size: 10 }, color: "#536174", padding: 14, usePointStyle: true, boxWidth: 8 },
                },
                tooltip: {
                  mode: "index",
                  intersect: false,
                  backgroundColor: "#172b4d",
                  titleColor: "#ffffff",
                  bodyColor: "#e8eef7",
                  borderColor: "#334b6b",
                  borderWidth: 1,
                  padding: 12,
                  cornerRadius: 10,
                  displayColors: true,
                },
              },
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
            }}
          />
        </div>
      </div>

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
              labels: data.cumulativeThroughput.labels,
              datasets: [
                {
                  label: "Total Work Items",
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
                  label: "Completed Issues",
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
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: "top",
                  labels: { font: { size: 10 }, color: "#536174", padding: 14, usePointStyle: true, boxWidth: 8 },
                },
                tooltip: {
                  mode: "index",
                  intersect: false,
                  backgroundColor: "#172b4d",
                  titleColor: "#ffffff",
                  bodyColor: "#e8eef7",
                  borderColor: "#334b6b",
                  borderWidth: 1,
                  padding: 12,
                  cornerRadius: 10,
                  displayColors: true,
                },
              },
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
            }}
          />
        </div>
      </div>
    </div>
  );
}

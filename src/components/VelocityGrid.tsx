"use client";

import { Bar } from "react-chartjs-2";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import { DeliveryChartData } from "@/lib/jira/types";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const COLORS = {
  committed: "#c03a2b",
  done: "#0e7c3e",
  carried: "#f2a900",
};

export function SprintDeliveryChart({ data }: { data: DeliveryChartData }) {
  return (
    <section className="flex h-full flex-col rounded-lg border border-jira-border bg-white p-5 shadow-sm">
      <h3 className="mb-1 text-sm font-bold uppercase tracking-wider text-jira-text">
        Sprint Delivery Overview
      </h3>
      <p className="mb-3 text-xs text-jira-text-muted">
        Committed, completed, and carried story points by sprint
      </p>
      <div className="h-64 min-w-0">
        <Bar
          data={{
            labels: data.labels,
            datasets: [
              {
                label: "Committed",
                data: data.committed,
                backgroundColor: COLORS.committed,
                borderRadius: 3,
              },
              {
                label: "Completed",
                data: data.done,
                backgroundColor: COLORS.done,
                borderRadius: 3,
              },
              {
                label: "Carried over",
                data: data.carried,
                backgroundColor: COLORS.carried,
                borderRadius: 3,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: "top",
                labels: {
                  font: { size: 10 },
                  color: "#536174",
                  padding: 12,
                  usePointStyle: true,
                  boxWidth: 8,
                },
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
              },
            },
            interaction: { mode: "index", intersect: false },
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
    </section>
  );
}

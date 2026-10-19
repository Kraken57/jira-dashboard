"use client";

import { PredictabilityData } from "@/lib/jira/types";

interface PredictabilityTabProps {
  data: PredictabilityData;
}

export function PredictabilityTab({ data }: PredictabilityTabProps) {
  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-jira-border rounded-lg p-4 shadow-sm">
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Predictability Index</p>
          <p className="text-2xl font-bold text-jira-green mt-1">{data.score}%</p>
          <p className="text-xs text-jira-text-light mt-1">Consistency of delivered commitments</p>
        </div>
        <div className="bg-white border border-jira-border rounded-lg p-4 shadow-sm">
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Commitment Variance</p>
          <p className="text-2xl font-bold text-jira-blue mt-1">±{data.varianceSP} SP</p>
          <p className="text-xs text-jira-text-light mt-1">Deviation from sprint capacity forecast</p>
        </div>
        <div className="bg-white border border-jira-border rounded-lg p-4 shadow-sm">
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Feature Milestone Confidence</p>
          <p className="text-2xl font-bold text-jira-green mt-1">{data.epicsOnSchedule}%</p>
          <p className="text-xs text-jira-text-light mt-1">Epics tracking for on-time release</p>
        </div>
      </div>

      {/* Historical Predictability Comparison Table */}
      <div className="bg-white border border-jira-border rounded-lg overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-jira-border">
          <h3 className="text-sm font-bold text-jira-text uppercase tracking-wider">
            Iteration Predictability Track Record
          </h3>
          <p className="text-xs text-jira-text-muted mt-0.5">
            Committed vs Delivered Story Points across quarterly iterations
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-jira-bg text-jira-text-muted text-xs uppercase border-b border-jira-border font-semibold">
              <tr>
                <th className="px-6 py-3">Iteration</th>
                <th className="px-6 py-3 text-right">Planned SP</th>
                <th className="px-6 py-3 text-right">Delivered SP</th>
                <th className="px-6 py-3 text-right">Say/Do Ratio</th>
                <th className="px-6 py-3 text-center">Predictability Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-jira-border/60">
              {data.history.map((row) => (
                <tr key={row.sprint} className="hover:bg-jira-bg/30 transition-colors">
                  <td className="px-6 py-3 font-semibold text-jira-text">{row.sprint}</td>
                  <td className="px-6 py-3 text-right text-jira-text-muted font-medium">{row.planned} SP</td>
                  <td className="px-6 py-3 text-right font-bold text-jira-blue">{row.delivered} SP</td>
                  <td className="px-6 py-3 text-right font-bold text-jira-text">{row.sayDo}%</td>
                  <td className="px-6 py-3 text-center">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        row.sayDo >= 80
                          ? "bg-jira-green-bg text-jira-green"
                          : row.sayDo >= 65
                          ? "bg-jira-blue-bg text-jira-blue"
                          : "bg-jira-red-bg text-jira-red"
                      }`}
                    >
                      {row.sayDo >= 80 ? "High Reliability" : row.sayDo >= 65 ? "Moderate" : "At Risk"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


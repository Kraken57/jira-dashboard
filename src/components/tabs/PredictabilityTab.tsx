"use client";

import { useState } from "react";
import { PredictabilityData } from "@/lib/jira/types";
import { DetailModal } from "@/components/DetailModal";

interface PredictabilityTabProps {
  data: PredictabilityData;
}

export function PredictabilityTab({ data }: PredictabilityTabProps) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={() => setOpen("Predictability Index")}
          className="text-left bg-white border border-jira-border rounded-lg p-4 shadow-sm hover:border-jira-green/50 transition"
        >
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Predictability Index</p>
          <p className="text-2xl font-bold text-jira-green mt-1">{data.score}%</p>
          <p className="text-xs text-jira-text-light mt-1">Consistency of delivered commitments</p>
        </button>
        <button
          type="button"
          onClick={() => setOpen("Commitment Variance")}
          className="text-left bg-white border border-jira-border rounded-lg p-4 shadow-sm hover:border-jira-blue/50 transition"
        >
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Commitment Variance</p>
          <p className="text-2xl font-bold text-jira-blue mt-1">±{data.varianceSP} SP</p>
          <p className="text-xs text-jira-text-light mt-1">Deviation from sprint capacity forecast</p>
        </button>
        <button
          type="button"
          onClick={() => setOpen("Feature Milestone Confidence")}
          className="text-left bg-white border border-jira-border rounded-lg p-4 shadow-sm hover:border-jira-green/50 transition"
        >
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Feature Milestone Confidence</p>
          <p className="text-2xl font-bold text-jira-green mt-1">
            {data.forecastableFeatures > 0 ? `${data.epicsOnSchedule}%` : "N/A"}
          </p>
          <p className="text-xs text-jira-text-light mt-1">
            {data.forecastableFeatures > 0
              ? `${data.forecastableFeatures} estimated feature(s) forecast`
              : "No estimated planned features"}
          </p>
        </button>
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

      {open && (
        <DetailModal
          title={open}
          subtitle={
            open === "Feature Milestone Confidence"
              ? "Forward-looking due-date forecast for planned features"
              : "Iteration predictability track record for the current filters"
          }
          onClose={() => setOpen(null)}
        >
          <div className="px-5 py-3 border-b border-jira-border bg-jira-bg/40 text-xs text-jira-text-muted space-y-1">
            {open === "Feature Milestone Confidence" ? (
              <>
                <p>
                  <span className="font-semibold text-jira-text">What this shows: </span>
                  The same forecast as the Executive Summary Future Predictability card.
                  It compares remaining child story points with weekday capacity until
                  each feature’s due date.
                </p>
                <p>
                  <span className="font-semibold text-jira-text">Current forecast: </span>
                  <span className="font-bold text-jira-green">
                    {data.forecastableFeatures > 0 ? `${data.epicsOnSchedule}%` : "N/A"}
                  </span>{" "}
                  {data.forecastableFeatures > 0
                    ? `of ${data.forecastableFeatures} estimated planned feature(s) are forecast on time.`
                    : "because no planned feature has a remaining SP estimate."}{" "}
                  Open the Executive card for feature-level reasons.
                </p>
              </>
            ) : (
              <>
                <p>
                  <span className="font-semibold text-jira-text">What this shows: </span>
                  Each row compares what was planned with what was delivered in that sprint.
                  A Say/Do of 80% or more is high reliability, 65–79% is moderate, and below
                  65% is at risk.
                </p>
                <p>
                  <span className="font-semibold text-jira-text">How to compare: </span>
                  Look for a stable or rising pattern across iterations, not a single good
                  sprint. A rising planned SP with a falling Say/Do means scope is growing
                  faster than delivery.
                </p>
              </>
            )}
          </div>
          {open !== "Feature Milestone Confidence" && (
          <table className="w-full text-left text-sm">
            <thead className="bg-jira-bg text-jira-text-muted text-xs uppercase border-b border-jira-border font-semibold sticky top-0">
              <tr>
                <th className="px-5 py-2.5">Iteration</th>
                <th className="px-5 py-2.5 text-right">Planned</th>
                <th className="px-5 py-2.5 text-right">Delivered</th>
                <th className="px-5 py-2.5 text-right">Say/Do</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-jira-border/60">
              {data.history.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-jira-text-muted">
                    No iteration history for this selection.
                  </td>
                </tr>
              ) : (
                data.history.map((row) => (
                  <tr key={row.sprint}>
                    <td className="px-5 py-2.5 text-xs font-semibold">{row.sprint}</td>
                    <td className="px-5 py-2.5 text-xs text-right">{row.planned} SP</td>
                    <td className="px-5 py-2.5 text-xs text-right">{row.delivered} SP</td>
                    <td className="px-5 py-2.5 text-xs text-right font-bold">{row.sayDo}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          )}
        </DetailModal>
      )}
    </div>
  );
}

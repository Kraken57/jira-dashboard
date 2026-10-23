"use client";

import { useState } from "react";
import { DiagnosisData } from "@/lib/jira/types";

interface DiagnosisTabProps {
  data: DiagnosisData;
  podName: string;
  jiraDomain?: string;
  statusFilter?: string;
}

export function DiagnosisTab({ data, podName, jiraDomain, statusFilter }: DiagnosisTabProps) {
  const [selectedContributor, setSelectedContributor] = useState<string | null>(null);

  const byStatus =
    statusFilter && statusFilter !== "all"
      ? data.unfinishedIssues.filter((i) => i.status === statusFilter)
      : data.unfinishedIssues;
  const contributorIssues = selectedContributor
    ? byStatus.filter((i) => i.assignee === selectedContributor)
    : [];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-jira-border rounded-lg p-4 shadow-sm">
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Slippage Volume</p>
          <p className="text-2xl font-bold text-jira-red mt-1">{data.slippageSP} SP</p>
          <p className="text-xs text-jira-text-light mt-1">{data.slippagePct}% of planned commitments</p>
        </div>
        <div className="bg-white border border-jira-border rounded-lg p-4 shadow-sm">
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Primary Driver</p>
          <p className="text-xl font-bold text-jira-text mt-1 truncate" title={data.primaryDriver}>
            {data.primaryDriver}
          </p>
          <p className="text-xs text-jira-text-light mt-1">Main cause of sprint drag</p>
        </div>
        <div className="bg-white border border-jira-border rounded-lg p-4 shadow-sm">
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Contributors with Spillover</p>
          <p className="text-2xl font-bold text-jira-amber mt-1">{data.atRiskContributorsCount}</p>
          <p className="text-xs text-jira-text-light mt-1">Developers carrying incomplete items</p>
        </div>
        <div className="bg-white border border-jira-border rounded-lg p-4 shadow-sm">
          <p className="text-xs uppercase text-jira-text-muted font-bold tracking-wider">Unfinished Work Items</p>
          <p className="text-2xl font-bold text-jira-text mt-1">{data.unfinishedIssues.length}</p>
          <p className="text-xs text-jira-text-light mt-1">Open issues needing resolution</p>
        </div>
      </div>

      {/* Contributor Slippage Section */}
      <div className="bg-white border border-jira-border rounded-lg overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-jira-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-jira-text uppercase tracking-wider">
              Contributor Slippage & Root Causes
            </h3>
            <p className="text-xs text-jira-text-muted mt-0.5">
              Identify which developers carry unfinished story points and examine the underlying reasons
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-jira-bg text-jira-text-muted text-xs uppercase border-b border-jira-border font-semibold">
              <tr>
                <th className="px-6 py-3">Developer</th>
                <th className="px-6 py-3">Pod / Team</th>
                <th className="px-6 py-3 text-center">Unfinished Items</th>
                <th className="px-6 py-3 text-right">Incomplete SP</th>
                <th className="px-6 py-3">Primary Slippage Cause</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-jira-border/60">
              {data.contributors.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-jira-green font-semibold">
                    ✓ Outstanding! No story point slippage or carry-over detected for this selection.
                  </td>
                </tr>
              ) : (
                data.contributors.map((c) => {
                  const isSelected = selectedContributor === c.name;
                  return (
                    <tr
                      key={c.name}
                      className={`hover:bg-jira-bg/40 transition-colors ${
                        isSelected ? "bg-jira-blue-bg/40" : ""
                      }`}
                    >
                      <td className="px-6 py-3 font-semibold text-jira-text flex items-center gap-2.5">
                        <span className="w-7 h-7 rounded-full bg-jira-red-bg text-jira-red flex items-center justify-center text-xs font-bold shrink-0">
                          {c.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                        </span>
                        <div>
                          <p className="text-xs font-bold text-jira-text">{c.name}</p>
                          <p className="text-[11px] text-jira-text-light">{c.completedSP} SP delivered</p>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-xs text-jira-text-muted">{c.team}</td>
                      <td className="px-6 py-3 text-center text-jira-red font-semibold text-xs">
                        {c.incompleteIssuesCount} items
                      </td>
                      <td className="px-6 py-3 text-right font-bold text-jira-red text-xs">
                        {c.incompleteSP} SP
                      </td>
                      <td className="px-6 py-3 text-xs">
                        <span className="inline-block px-2.5 py-1 rounded text-[11px] font-semibold bg-jira-bg border border-jira-border/60 text-jira-text">
                          {c.primaryReason}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedContributor(c.name)}
                          className="px-2.5 py-1 text-xs rounded font-semibold bg-jira-bg text-jira-blue hover:bg-jira-blue-bg border border-jira-border transition-colors"
                        >
                          View Issues
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Unresolved Issues Table (The Root Issues) */}
      <div className="bg-white border border-jira-border rounded-lg overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-jira-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-jira-text uppercase tracking-wider">
              All Unresolved & Carried-Over Issues
            </h3>
            <p className="text-xs text-jira-text-muted mt-0.5">
              Click any issue key to open directly in Jira Cloud and review blockers
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-jira-bg rounded text-jira-text-muted border border-jira-border self-start sm:self-auto">
            {byStatus.length} issues causing slippage
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-jira-bg text-jira-text-muted text-xs uppercase border-b border-jira-border font-semibold">
              <tr>
                <th className="px-5 py-3 w-28">Key</th>
                <th className="px-5 py-3 w-24">Type</th>
                <th className="px-5 py-3">Summary</th>
                <th className="px-5 py-3 w-20 text-center">SP</th>
                <th className="px-5 py-3 w-36">Assignee</th>
                <th className="px-5 py-3 w-32">Status</th>
                <th className="px-5 py-3">Slippage Diagnosis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-jira-border/60">
              {byStatus.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-jira-text-muted">
                    No unfinished issues found for this selection.
                  </td>
                </tr>
              ) : (
                byStatus.map((issue) => (
                  <tr key={issue.key} className="hover:bg-jira-bg/30 transition-colors">
                    <td className="px-5 py-3 font-semibold text-xs whitespace-nowrap">
                      <a
                        href={
                          jiraDomain
                            ? `${jiraDomain}/browse/${issue.key}`
                            : undefined
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-jira-blue hover:underline inline-flex items-center gap-1"
                      >
                        {issue.key}
                        <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                          issue.workType === "Bug"
                            ? "bg-jira-red-bg text-jira-red"
                            : issue.workType === "Story"
                            ? "bg-jira-blue-bg text-jira-blue"
                            : "bg-jira-bg text-jira-text-muted border border-jira-border/60"
                        }`}
                      >
                        {issue.workType}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-jira-text font-medium text-xs line-clamp-1">{issue.summary}</p>
                      <p className="text-[11px] text-jira-text-light mt-0.5">
                        {issue.podName} • {issue.sprint}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-center whitespace-nowrap">
                      <span className="text-xs font-bold bg-jira-bg px-2 py-0.5 rounded border border-jira-border text-jira-text">
                        {issue.storyPoints}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-jira-text whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setSelectedContributor(issue.assignee)}
                        className="text-jira-text hover:text-jira-blue hover:underline text-left font-medium"
                      >
                        {issue.assignee}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-xs whitespace-nowrap">
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-jira-blue-bg text-jira-blue">
                        {issue.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                          issue.reason.includes("Bug") || issue.reason.includes("Defect")
                            ? "bg-jira-red-bg text-jira-red"
                            : issue.reason.includes("8+")
                            ? "bg-jira-amber-bg text-jira-amber"
                            : "bg-jira-blue-bg text-jira-blue"
                        }`}
                      >
                        {issue.reason}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Contributor issues modal — no page jump, no scroll */}
      {selectedContributor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelectedContributor(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-jira-border">
              <div>
                <h3 className="text-sm font-bold text-jira-text uppercase tracking-wider">
                  Unfinished Items · {selectedContributor}
                </h3>
                <p className="text-xs text-jira-text-muted mt-0.5">
                  {contributorIssues.length} open item(s) · {podName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedContributor(null)}
                className="text-jira-text-muted hover:text-jira-text text-lg leading-none px-2"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-jira-bg text-jira-text-muted text-xs uppercase border-b border-jira-border font-semibold sticky top-0">
                  <tr>
                    <th className="px-5 py-2.5">Key</th>
                    <th className="px-5 py-2.5">Summary</th>
                    <th className="px-5 py-2.5 text-center">SP</th>
                    <th className="px-5 py-2.5">Status</th>
                    <th className="px-5 py-2.5">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-jira-border/60">
                  {contributorIssues.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-jira-text-muted">
                        No unfinished items for this contributor.
                      </td>
                    </tr>
                  ) : (
                    contributorIssues.map((issue) => (
                      <tr key={issue.key} className="hover:bg-jira-bg/30">
                        <td className="px-5 py-2.5 font-semibold text-xs whitespace-nowrap">
                          {jiraDomain ? (
                            <a
                              href={`${jiraDomain}/browse/${issue.key}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-jira-blue hover:underline"
                            >
                              {issue.key}
                            </a>
                          ) : (
                            issue.key
                          )}
                        </td>
                        <td className="px-5 py-2.5 text-xs text-jira-text">
                          <p className="line-clamp-1">{issue.summary}</p>
                          <p className="text-[11px] text-jira-text-light mt-0.5">
                            {issue.podName} • {issue.sprint}
                          </p>
                        </td>
                        <td className="px-5 py-2.5 text-center text-xs font-bold">{issue.storyPoints}</td>
                        <td className="px-5 py-2.5 text-xs whitespace-nowrap">{issue.status}</td>
                        <td className="px-5 py-2.5 text-xs text-jira-text-muted">{issue.reason}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


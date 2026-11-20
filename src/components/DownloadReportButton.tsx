"use client";

import { useState } from "react";
import type { RawFeedPayload } from "@/lib/jira/types";

interface DownloadReportButtonProps {
  feed: RawFeedPayload | null;
  disabled?: boolean;
}

export function DownloadReportButton({ feed, disabled = false }: DownloadReportButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const download = async () => {
    if (!feed || busy || disabled) return;
    setBusy(true);
    setError("");
    try {
      const { downloadExcelReport } = await import("@/lib/reports/downloadExcel");
      await downloadExcelReport(feed);
    } catch (cause) {
      console.error("[REPORT_EXPORT] Excel download failed", cause);
      setError(cause instanceof Error ? cause.message : "The Excel report could not be created.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={download}
        disabled={!feed || disabled || busy}
        aria-busy={busy}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-jira-blue bg-jira-blue px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-55"
      >
        {busy ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
        ) : (
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
            <path d="M10 2.5v9m0 0 3.5-3.5M10 11.5 6.5 8M3 13.5v2A1.5 1.5 0 0 0 4.5 17h11a1.5 1.5 0 0 0 1.5-1.5v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {busy ? "Preparing Excel…" : "Download Report"}
      </button>
      {error && <span role="alert" className="max-w-sm text-right text-xs text-red-700">Excel download failed: {error}</span>}
    </div>
  );
}

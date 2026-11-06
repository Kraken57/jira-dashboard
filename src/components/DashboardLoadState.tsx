"use client";

import { useEffect, useState } from "react";
import type { DashboardLoadFailure } from "@/lib/jira/types";

export type DashboardLoadingStage =
  | "connecting"
  | "jira"
  | "metrics"
  | "zephyr"
  | "preparing";

const steps: { stage: DashboardLoadingStage; message: string }[] = [
  { stage: "connecting", message: "Connecting to Jira..." },
  { stage: "jira", message: "Loading Jira projects and issues..." },
  { stage: "metrics", message: "Calculating sprint metrics..." },
  { stage: "zephyr", message: "Loading Zephyr test data..." },
  { stage: "preparing", message: "Preparing your dashboard..." },
];

export function DashboardLoadingOverlay({
  stage,
  timedOut,
}: {
  stage: DashboardLoadingStage;
  timedOut: boolean;
}) {
  const currentIndex = steps.findIndex((step) => step.stage === stage);
  const [inForge, setInForge] = useState(false);

  useEffect(() => {
    setInForge(window.self !== window.top);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex min-h-screen items-center justify-center bg-jira-bg/95 p-4 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-label="Dashboard loading"
    >
      <section className="w-full max-w-lg rounded-2xl border border-jira-border bg-white p-6 shadow-xl sm:p-8">
        <div className="flex items-center gap-4">
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-jira-blue-bg">
            <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-jira-blue/20 border-t-jira-blue motion-reduce:animate-none" />
          </span>
          <div>
            <h1 className="mt-1 text-lg font-bold text-jira-text">Loading dashboard</h1>
          </div>
        </div>
        <ol className="mt-6 space-y-3" aria-label="Dashboard loading steps">
          {steps.map((step, index) => {
            const active = index === currentIndex;
            const complete = index < currentIndex;
            const message = step.stage === "connecting" && inForge
              ? "Connecting to Forge..."
              : step.message;
            return (
              <li
                key={step.stage}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
                  active
                    ? "border-jira-blue/30 bg-jira-blue-bg/60"
                    : "border-jira-border bg-white"
                }`}
                aria-current={active ? "step" : undefined}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    complete
                      ? "bg-jira-green-bg text-jira-green"
                      : active
                        ? "bg-jira-blue text-white"
                        : "bg-jira-bg text-jira-text-muted"
                  }`}
                >
                  {complete ? "OK" : index + 1}
                </span>
                <span className="min-w-0 text-sm text-jira-text">{`Step ${index + 1}: ${message}`}</span>
              </li>
            );
          })}
        </ol>
        {timedOut && (
          <p className="mt-5 rounded-lg border border-jira-amber/40 bg-jira-amber/10 px-4 py-3 text-sm leading-6 text-jira-text">
            Dashboard is taking longer than expected.
            <br />
            Please wait while Jira and Zephyr data are being processed.
          </p>
        )}
      </section>
    </div>
  );
}

export function DashboardLoadErrorPanel({
  failure,
  onRetry,
}: {
  failure: DashboardLoadFailure;
  onRetry: () => void;
}) {
  return (
    <section
      className="rounded-xl border border-jira-red/30 bg-white p-5 shadow-sm"
      role="alert"
      aria-live="assertive"
    >
      <h2 className="text-base font-bold text-jira-red">Dashboard data could not be loaded.</h2>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
        <dt className="font-semibold text-jira-text-muted">Failing API</dt>
        <dd className="break-words text-jira-text">{failure.api}</dd>
        <dt className="font-semibold text-jira-text-muted">Status code</dt>
        <dd className="text-jira-text">{failure.statusCode ?? "Unavailable"}</dd>
        <dt className="font-semibold text-jira-text-muted">Error message</dt>
        <dd className="break-words text-jira-text">{failure.message}</dd>
      </dl>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 rounded-md bg-jira-blue px-4 py-2 text-sm font-semibold text-white transition hover:bg-jira-blue-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jira-blue"
      >
        Try again
      </button>
    </section>
  );
}

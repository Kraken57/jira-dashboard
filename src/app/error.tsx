"use client";

import { useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardLoadErrorPanel } from "@/components/DashboardLoadState";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[DASHBOARD_RENDER] Unhandled dashboard error", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <DashboardLayout>
      <DashboardLoadErrorPanel
        failure={{
          api: "Dashboard rendering",
          statusCode: null,
          message: error.message || "An unexpected dashboard rendering error occurred.",
        }}
        onRetry={reset}
      />
    </DashboardLayout>
  );
}

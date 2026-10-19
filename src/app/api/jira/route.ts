import { NextRequest, NextResponse } from "next/server";
import { getDashboardData } from "@/lib/jira/jiraService";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const podId = searchParams.get("pod") || "all";
    const quarterId = searchParams.get("quarter") || "all";
    const sprintId = searchParams.get("sprint") || "all";

    const data = await getDashboardData({
      podId,
      quarterId,
      sprintId,
    });

    return NextResponse.json(data, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    // Allow Next.js internal bail-out signals to propagate
    if ((error as { digest?: string })?.digest?.startsWith("NEXT_")) {
      throw error;
    }

    console.error("Error fetching Jira dashboard metrics:", error);
    return NextResponse.json(
      { error: "Failed to fetch Jira metrics", details: (error as Error).message },
      { status: 500 }
    );
  }
}


import { NextRequest, NextResponse } from "next/server";
import { getDashboardData, getRawFeed } from "@/lib/jira/jiraService";

/**
 * Localhost / standalone mode only.
 * Serves real Jira data to the browser using the credentials in .env.local.
 *
 * In the Forge build this route is swapped for a static stub by
 * scripts/build-forge.mjs, because Forge Custom UI needs a static export and
 * the frontend talks to the Forge backend over the bridge instead.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Raw feed: the browser computes every filter itself. One request per TTL
    // window, then filter clicks never touch the network again.
    if (searchParams.get("raw") === "1") {
      const feed = await getRawFeed();
      return NextResponse.json(feed, {
        status: 200,
        headers: { "Cache-Control": "no-store, max-age=0" },
      });
    }

    // Legacy per-filter compute path (fallback; reads the same disk cache).
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

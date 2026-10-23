import { NextResponse } from "next/server";

// Static stub for the Forge build: the frontend talks to the Forge backend
// over the bridge, so the local API route is not needed.
export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(
    { error: "Local API route is disabled in the Forge build" },
    { status: 404 }
  );
}

/**
 * Forge build script.
 *
 * The Forge Custom UI needs a static bundle (next build --output export), but
 * Next.js refuses to export a route that reads request data. The local
 * /api/jira route is only needed for localhost, so for the Forge build we
 * temporarily swap it for a static 404 stub, then restore the original.
 *
 * Usage: node scripts/build-forge.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROUTE = join(process.cwd(), "src", "app", "api", "jira", "route.ts");
const BACKUP = `${ROUTE}.localhost.bak`;

const STUB = `import { NextResponse } from "next/server";

// Static stub for the Forge build: the frontend talks to the Forge backend
// over the bridge, so the local API route is not needed.
export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(
    { error: "Local API route is disabled in the Forge build" },
    { status: 404 }
  );
}
`;

function run(cmd, args, env) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    env: { ...process.env, ...env },
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!existsSync(ROUTE)) {
  console.error(`Route file not found: ${ROUTE}`);
  process.exit(1);
}

const original = readFileSync(ROUTE, "utf8");

try {
  console.log("[build-forge] Swapping /api/jira route for static stub...");
  renameSync(ROUTE, BACKUP);
  writeFileSync(ROUTE, STUB, "utf8");

  console.log("[build-forge] Building static export into ./out ...");
  run(process.execPath, [join("node_modules", "next", "dist", "bin", "next"), "build"], {
    FORGE_BUILD: "true",
  });

  console.log("[build-forge] Done. Static bundle is in ./out");
} finally {  if (existsSync(BACKUP)) {
    rmSync(ROUTE, { force: true });
    renameSync(BACKUP, ROUTE);
    console.log("[build-forge] Restored original /api/jira route");
  }
}

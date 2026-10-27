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
import { spawn } from "node:child_process";
import { cpSync, existsSync, readFileSync, renameSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROUTE = join(process.cwd(), "src", "app", "api", "jira", "route.ts");
const BACKUP = `${ROUTE}.localhost.bak`;
const STUB_MARKER = "Static stub for the Forge build";

// Restore the real route even if the build is interrupted (Ctrl+C, killed
// terminal, or an exception). Without this, a half-finished build leaves the
// 404 stub in place and `pnpm dev` shows "Failed to fetch dashboard data".
function restoreRoute() {
  if (!existsSync(BACKUP)) return;
  try {
    rmSync(ROUTE, { force: true });
    renameSync(BACKUP, ROUTE);
    console.log("[build-forge] Restored original /api/jira route");
  } catch (err) {
    console.error("[build-forge] Could not restore /api/jira route:", err);
  }
}

let activeChild = null;

function shutdown(signal, code) {
  if (activeChild && !activeChild.killed) {
    activeChild.kill(signal);
  }
  restoreRoute();
  process.exit(code);
}

process.on("exit", restoreRoute);
process.on("SIGINT", () => shutdown("SIGINT", 130));
process.on("SIGTERM", () => shutdown("SIGTERM", 143));
process.on("SIGHUP", () => shutdown("SIGHUP", 129));

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
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    activeChild = child;

    child.on("error", (err) => {
      activeChild = null;
      reject(err);
    });
    child.on("exit", (code, signal) => {
      activeChild = null;
      if (signal) {
        reject(new Error(`Command terminated by ${signal}`));
      } else if (code !== 0) {
        reject(new Error(`Command failed with exit code ${code ?? 1}`));
      } else {
        resolve();
      }
    });
  });
}

if (!existsSync(ROUTE)) {
  console.error(`Route file not found: ${ROUTE}`);
  process.exit(1);
}

// Recover from an interrupted build that left the static stub in place.
if (existsSync(BACKUP)) {
  const current = readFileSync(ROUTE, "utf8");
  if (current.includes(STUB_MARKER)) {
    console.log("[build-forge] Recovering original /api/jira route...");
    rmSync(ROUTE, { force: true });
    renameSync(BACKUP, ROUTE);
  } else {
    console.log("[build-forge] Discarding stale route backup...");
    rmSync(BACKUP, { force: true });
  }
}

const original = readFileSync(ROUTE, "utf8");
if (original.includes(STUB_MARKER)) {
  throw new Error(
    "src/app/api/jira/route.ts is the Forge stub, not the real API route. Restore it with: git checkout -- src/app/api/jira/route.ts"
  );
}

try {
  console.log("[build-forge] Swapping /api/jira route for static stub...");
  renameSync(ROUTE, BACKUP);
  writeFileSync(ROUTE, STUB, "utf8");

  console.log("[build-forge] Building static export into ./out ...");
  await run(
    process.execPath,
    [join("node_modules", "next", "dist", "bin", "next"), "build"],
    { FORGE_BUILD: "true" }
  );

  const forgeOut = join(process.cwd(), "forge", "out");
  console.log("[build-forge] Copying static bundle into forge/out ...");
  rmSync(forgeOut, { recursive: true, force: true });
  cpSync(join(process.cwd(), "out"), forgeOut, { recursive: true });

  console.log("[build-forge] Done. Static bundle is in ./out and ./forge/out");
} finally {
  restoreRoute();
}

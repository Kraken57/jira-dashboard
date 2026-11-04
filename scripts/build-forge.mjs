import { spawn } from "node:child_process";
import { cpSync, existsSync, readFileSync, renameSync, writeFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, relative, sep } from "node:path";
import { filesIn, projectRoot, validateConfig, validateForge } from "./validate-forge.mjs";

const ROUTE = join(projectRoot, "src", "app", "api", "jira", "route.ts");
const BACKUP = `${ROUTE}.localhost.bak`;
const STUB_MARKER = "Static stub for the Forge build";
const require = createRequire(import.meta.url);
let activeChild;
let routeSwapped = false;

function restoreRoute() {
  if (!routeSwapped || !existsSync(BACKUP)) return;
  rmSync(ROUTE, { force: true });
  renameSync(BACKUP, ROUTE);
  routeSwapped = false;
  console.log("[build-forge] Restored original /api/jira route");
}

function shutdown(signal, code) {
  if (activeChild) activeChild.kill(signal);
  try { restoreRoute(); }
  catch (error) { console.error("[build-forge] Route restoration failed:", error); code = 1; }
  process.exit(code);
}

process.on("SIGINT", () => shutdown("SIGINT", 130));
process.on("SIGTERM", () => shutdown("SIGTERM", 143));
process.on("SIGHUP", () => shutdown("SIGHUP", 129));
process.on("exit", () => {
  try { restoreRoute(); }
  catch (error) { console.error("[build-forge] Route restoration failed:", error); process.exitCode = 1; }
});

const STUB = `import { NextResponse } from "next/server";
// ${STUB_MARKER}: data is fetched through @forge/bridge.
export const dynamic = "force-static";
export async function GET() {
  return NextResponse.json({ error: "Local API route is disabled in the Forge build" }, { status: 404 });
}
`;

function rewriteMarkupPaths(root) {
  let changed = 0;
  for (const file of filesIn(root)) {
    if (![".html", ".txt"].includes(extname(file))) continue;
    const prefix = relative(dirname(file), root).split(sep).join("/") || ".";
    const assetPrefix = prefix === "." ? "./" : `${prefix}/`;
    const raw = readFileSync(file, "utf8");
    const next = raw
      .replace(/(?<![\w./])\/_next\//g, `${prefix}/_next/`)
      .replace(/(?<![\w./])\.\/_next\//g, `${assetPrefix}_next/`)
      .replace(/(\b(?:src|href)=["'])\.\/(?!\/)/g, `$1${assetPrefix}`)
      .replace(/(\b(?:src|href)=["'])\/(?!\/)/g, `$1${prefix}/`);
    if (next !== raw) { writeFileSync(file, next); changed++; }
  }
  console.log(`[build-forge] Normalized relative URLs in ${changed} markup/RSC files`);
}

function runBuild() {
  const major = Number(require("next/package.json").version.split(".")[0]);
  const args = [join(projectRoot, "node_modules", "next", "dist", "bin", "next"), "build"];
  if (major >= 16) args.push("--webpack");
  return new Promise((resolve, reject) => {
    activeChild = spawn(process.execPath, args, {
      cwd: projectRoot,
      stdio: "inherit",
      env: { ...process.env, FORGE_BUILD: "true" },
    });
    activeChild.on("error", reject);
    activeChild.on("exit", (code, signal) => {
      activeChild = undefined;
      if (code === 0) resolve();
      else reject(new Error(`Next export failed (${signal || code})`));
    });
  });
}

async function build() {
  if (!existsSync(ROUTE)) throw new Error(`Route file not found: ${ROUTE}`);
  if (existsSync(BACKUP)) {
    const current = readFileSync(ROUTE, "utf8");
    if (current.includes(STUB_MARKER)) {
      rmSync(ROUTE, { force: true });
      renameSync(BACKUP, ROUTE);
      console.log("[build-forge] Recovered original /api/jira route from prior interrupted build");
    } else {
      throw new Error("An unexpected API route backup exists. Resolve it manually; refusing to discard local changes.");
    }
  }
  if (readFileSync(ROUTE, "utf8").includes(STUB_MARKER)) {
    throw new Error("The local API route is already a Forge stub; restore the real route before building.");
  }

  await validateConfig();
  const out = join(projectRoot, "out");
  const forgeOut = join(projectRoot, "forge", "out");
  rmSync(out, { recursive: true, force: true });
  rmSync(forgeOut, { recursive: true, force: true });

  try {
    console.log("[build-forge] Swapping /api/jira route for static stub...");
    renameSync(ROUTE, BACKUP);
    routeSwapped = true;
    writeFileSync(ROUTE, STUB);
    console.log("[build-forge] Building static export into ./out ...");
    await runBuild();
  } finally {
    restoreRoute();
  }

  rewriteMarkupPaths(out);
  cpSync(out, forgeOut, { recursive: true });
  console.log("[build-forge] Validating export and Forge resource...");
  console.log("[build-forge] PASS", await validateForge());
}

build().catch((error) => {
  console.error("[build-forge] FAIL:", error);
  rmSync(join(projectRoot, "forge", "out"), { recursive: true, force: true });
  process.exitCode = 1;
});

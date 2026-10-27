/**
 * Restore the real local /api/jira route if an interrupted Forge build left
 * the static stub in place. Runs before `pnpm dev` and `pnpm build`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROUTE = join(process.cwd(), "src", "app", "api", "jira", "route.ts");
const BACKUP = `${ROUTE}.localhost.bak`;
const STUB_MARKER = "Static stub for the Forge build";

if (!existsSync(ROUTE) || !readFileSync(ROUTE, "utf8").includes(STUB_MARKER)) {
  process.exit(0);
}

if (existsSync(BACKUP)) {
  rmSync(ROUTE, { force: true });
  renameSync(BACKUP, ROUTE);
  console.log("[ensure-local-route] Restored /api/jira from the build backup");
  process.exit(0);
}

try {
  const fromHead = execFileSync(
    "git",
    ["show", "HEAD:src/app/api/jira/route.ts"],
    { encoding: "utf8" }
  );
  if (fromHead.includes(STUB_MARKER)) throw new Error("HEAD has the stub");
  writeFileSync(ROUTE, fromHead, "utf8");
  console.log("[ensure-local-route] Restored /api/jira from git HEAD");
} catch {
  console.error(
    "[ensure-local-route] /api/jira is the Forge stub. Restore it with:\n" +
      "  git checkout -- src/app/api/jira/route.ts"
  );
  process.exit(1);
}

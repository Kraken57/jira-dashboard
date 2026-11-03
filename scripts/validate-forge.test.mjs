import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { resourceDirectory, validateAssets, validateForge } from "./validate-forge.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "forge-assets-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (name, value) => {
    const file = join(root, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, value);
  };
  put("out/index.html", '<html><head><link rel="stylesheet" href="./_next/static/css/app.css"></head><body><script src="./_next/static/chunks/webpack-test.js"></script></body></html>');
  put("out/_next/static/css/app.css", ".flex{display:flex}.bg-jira-bg{background:#fff}.text-jira-text{color:#000}");
  put("out/_next/static/chunks/webpack-test.js", 'r.p="./_next/";');
  put("out/_next/static/chunks/lazy.js", "console.log('lazy')");
  put("out/404/index.html", '<link rel="stylesheet" href="../_next/static/css/app.css">');
  put("out/index.txt", '["./_next/static/css/app.css"]');
  put("next.config.mjs", 'export default {output:"export",trailingSlash:true,assetPrefix:"./",images:{unoptimized:true}};');
  put(".next/BUILD_ID", "test-build");
  put(".next/required-server-files.json", JSON.stringify({ config: { output: "export", assetPrefix: "./" } }));
  put(".next/prerender-manifest.json", JSON.stringify({ routes: { "/": {} }, dynamicRoutes: {} }));
  put(".next/server/app-paths-manifest.json", JSON.stringify({ "/page": "app/page.js" }));
  put("src/app/api/jira/route.ts", 'export const dynamic = "force-dynamic";');
  put("forge/manifest.yml", `modules:\n  jira:globalPage:\n    - key: dashboard-page\n      resource: dashboard-ui\nresources:\n  - key: dashboard-ui\n    path: out\npermissions:\n  content:\n    scripts: [unsafe-inline]\n    styles: [unsafe-inline]\n`);
  cpSync(join(root, "out"), join(root, "forge", "out"), { recursive: true });
  cpSync(join(root, "out", "_next", "static"), join(root, ".next", "static"), { recursive: true });
  return { root, put, out: join(root, "out") };
}

test("accepts a relative static export and identical Forge resource", async (t) => {
  const { root } = fixture(t);
  assert.equal((await validateForge(root)).deployed.css, 1);
});

for (const [name, path] of [["CSS", "_next/static/css"], ["JS chunks", "_next/static/chunks"], ["_next folder", "_next"], ["entry point", "index.html"]]) {
  test(`rejects missing ${name}`, (t) => {
    const { out } = fixture(t);
    rmSync(join(out, path), { recursive: true, force: true });
    assert.throws(() => validateAssets(out));
  });
}

test("rejects uncompiled Tailwind", (t) => {
  const { out, put } = fixture(t);
  put("out/_next/static/css/app.css", '@import "tailwindcss";');
  assert.throws(() => validateAssets(out), /not compiled/);
});
test("rejects absolute HTML asset URLs", (t) => {
  const { out, put } = fixture(t);
  put("out/index.html", '<link rel="stylesheet" href="/_next/static/css/app.css">');
  assert.throws(() => validateAssets(out), /Non-relative/);
});
test("rejects absolute runtime prefix", (t) => {
  const { out, put } = fixture(t);
  put("out/_next/static/chunks/webpack-test.js", 'r.p="/_next/";');
  assert.throws(() => validateAssets(out), /publicPath/);
});
test("rejects a missing nested asset", (t) => {
  const { out, put } = fixture(t);
  put("out/404/index.html", '<script src="./_next/static/chunks/missing.js"></script>');
  assert.throws(() => validateAssets(out));
});
test("rejects absolute public files", (t) => {
  const { out, put } = fixture(t);
  put("out/404/index.html", '<link rel="icon" href="/favicon.ico">');
  assert.throws(() => validateAssets(out), /Non-relative/);
});
test("rejects an invalid resource path", (t) => {
  const { root, put } = fixture(t);
  put("forge/manifest.yml", readFileSync(join(root, "forge/manifest.yml"), "utf8").replace("path: out", "path: ../out"));
  assert.throws(() => resourceDirectory(root), /must point/);
});
test("rejects missing inline CSP permission", (t) => {
  const { root, put } = fixture(t);
  put("forge/manifest.yml", readFileSync(join(root, "forge/manifest.yml"), "utf8").replace("scripts: [unsafe-inline]", "scripts: []"));
  assert.throws(() => resourceDirectory(root), /inline-script/);
});
test("rejects stale copied files", async (t) => {
  const { root, put } = fixture(t);
  put("forge/out/_next/static/chunks/stale.js", "old");
  await assert.rejects(validateForge(root), /missing or stale/);
});
test("rejects missing lazy chunks from both exports", async (t) => {
  const { root, out } = fixture(t);
  rmSync(join(out, "_next/static/chunks/lazy.js"));
  rmSync(join(root, "forge/out/_next/static/chunks/lazy.js"));
  await assert.rejects(validateForge(root), /Static asset tree/);
});
test("rejects an export without the relative prefix", async (t) => {
  const { root, put } = fixture(t);
  put(".next/required-server-files.json", JSON.stringify({ config: { output: "export", assetPrefix: "" } }));
  await assert.rejects(validateForge(root), /wrong assetPrefix/);
});
test("rejects dynamic routes and a stubbed local API", async (t) => {
  const { root, put } = fixture(t);
  put(".next/prerender-manifest.json", JSON.stringify({ routes: { "/": {} }, dynamicRoutes: { "/[id]": {} } }));
  await assert.rejects(validateForge(root), /dynamic server routes/);
  put(".next/prerender-manifest.json", JSON.stringify({ routes: { "/": {} }, dynamicRoutes: {} }));
  put("src/app/api/jira/route.ts", "// Static stub for the Forge build");
  await assert.rejects(validateForge(root), /not restored/);
});

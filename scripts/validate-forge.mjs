import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import yaml from "js-yaml";

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function filesIn(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    assert(!entry.isSymbolicLink(), `Symlink is not a deployable asset: ${path}`);
    return entry.isDirectory() ? filesIn(path) : [path];
  });
}

function requireFile(path) {
  const info = statSync(path);
  assert(info.isFile(), `Missing file: ${path}`);
  assert(info.size > 0, `Empty file: ${path}`);
}

function compareTrees(source, target, label) {
  const sourceFiles = filesIn(source).map((file) => relative(source, file)).sort();
  const targetFiles = filesIn(target).map((file) => relative(target, file)).sort();
  assert.deepEqual(targetFiles, sourceFiles, `${label} has missing or stale files; rebuild`);
  for (const name of sourceFiles) {
    assert(readFileSync(join(source, name)).equals(readFileSync(join(target, name))), `${label} differs: ${name}`);
  }
}

export async function validateConfig(root = projectRoot) {
  const configs = readdirSync(root).filter((name) => /^next\.config\.(js|mjs|ts)$/.test(name));
  assert.deepEqual(configs, ["next.config.mjs"], "Use one canonical next.config.mjs");
  const previous = process.env.FORGE_BUILD;
  process.env.FORGE_BUILD = "true";
  let config;
  try {
    const configUrl = pathToFileURL(join(root, configs[0]));
    configUrl.searchParams.set("validation", String(Date.now()));
    config = (await import(configUrl.href)).default;
  } finally {
    if (previous === undefined) delete process.env.FORGE_BUILD;
    else process.env.FORGE_BUILD = previous;
  }
  assert.equal(config.output, "export", "Forge requires output: export");
  assert.equal(config.trailingSlash, true, "Forge export requires trailingSlash: true");
  assert.equal(config.assetPrefix, "./", "Forge requires assetPrefix: ./");
  assert(!config.basePath, "A Next basePath cannot represent Forge's versioned resource URL");
  assert.equal(config.images?.unoptimized, true, "Forge has no Next image optimization server");
  return config;
}

export function resourceDirectory(root = projectRoot) {
  const forgeRoot = join(root, "forge");
  const manifest = yaml.load(readFileSync(join(forgeRoot, "manifest.yml"), "utf8"));
  const pages = manifest?.modules?.["jira:globalPage"];
  assert(Array.isArray(pages) && pages.length > 0, "Missing Jira global page");
  const page = pages[0];
  const resources = manifest.resources?.filter((entry) => entry.key === page.resource) || [];
  assert.equal(resources.length, 1, "Global page must resolve to exactly one Forge resource");
  const path = resources[0].path;
  assert(typeof path === "string" && path.length > 0 && !isAbsolute(path), "Resource path must be relative to forge");
  const resourceRoot = resolve(forgeRoot, path);
  assert.equal(resourceRoot, join(forgeRoot, "out"), "Forge resource must point to forge/out");
  assert(manifest.permissions?.content?.scripts?.includes("unsafe-inline"), "Next bootstrap needs inline-script permission");
  assert(manifest.permissions?.content?.styles?.includes("unsafe-inline"), "Dashboard styles need inline-style permission");
  requireFile(join(resourceRoot, "index.html"));
  return resourceRoot;
}

function requireLocalReference(root, file, reference) {
  if (/^(?:data:|blob:|#)/i.test(reference)) return;
  assert(!/^(?:[a-z][a-z\d+.-]*:|\/\/|\/)/i.test(reference), `Non-relative resource URL in ${relative(root, file)}: ${reference}`);
  const mount = "https://forge.invalid/resources/app/environment/version/dashboard/";
  const page = new URL(relative(root, file).split(sep).join("/"), mount);
  const url = new URL(reference.replaceAll("&amp;", "&"), page);
  assert(url.href.startsWith(mount), `Asset escapes Forge resource: ${reference}`);
  const target = resolve(root, decodeURIComponent(url.pathname.slice(new URL(mount).pathname.length)));
  assert(!relative(root, target).startsWith(".."), `Asset escapes export: ${reference}`);
  requireFile(target);
}

export function validateAssets(root, expectedStaticRoot) {
  requireFile(join(root, "index.html"));
  const files = filesIn(root);
  const staticRoot = join(root, "_next", "static");
  assert(statSync(staticRoot).isDirectory(), "Missing _next/static directory");
  const staticFiles = filesIn(staticRoot);
  if (expectedStaticRoot) compareTrees(expectedStaticRoot, staticRoot, "Static asset tree");
  const css = staticFiles.filter((file) => extname(file) === ".css");
  const chunks = staticFiles.filter((file) => extname(file) === ".js" && file.startsWith(join(staticRoot, "chunks") + sep));
  assert(css.length, "CSS bundle missing from _next/static");
  assert(chunks.length, "JS chunks missing from _next/static/chunks");
  staticFiles.forEach(requireFile);
  const combinedCss = css.map((file) => readFileSync(file, "utf8")).join("\n");
  assert(!/@import\s+["']tailwindcss/.test(combinedCss), "Tailwind import was not compiled");
  for (const selector of [".flex", ".bg-jira-bg", ".text-jira-text"]) {
    assert(combinedCss.includes(`${selector}{`) || combinedCss.includes(`${selector} {`), `Tailwind utility missing: ${selector}`);
  }
  const runtimes = chunks.filter((file) => /[\\/]webpack-[^\\/]+\.js$/.test(file));
  assert(runtimes.length, "Missing supported Webpack runtime");
  for (const runtime of runtimes) {
    assert(/\.p=(['"])\.\/_next\/\1/.test(readFileSync(runtime, "utf8")), `Webpack publicPath must be ./_next/: ${runtime}`);
  }

  let references = 0;
  for (const file of files) {
    if (![".html", ".txt", ".css"].includes(extname(file))) continue;
    const content = readFileSync(file, "utf8");
    for (const match of content.matchAll(/(?<![\w./])((?:\.{1,2}\/)*_next\/[^"'\\\s<>),;]+|\/_next\/[^"'\\\s<>),;]+)/g)) {
      requireLocalReference(root, file, match[1]);
      references++;
    }
    if (extname(file) === ".html") {
      assert(!/<base\b/i.test(content), `A base tag can break relative assets: ${file}`);
      for (const tag of content.matchAll(/<(?:script|link|img|source)\b[^>]*>/gi)) {
        for (const attr of tag[0].matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) requireLocalReference(root, file, attr[1]);
      }
    }
    if (extname(file) === ".css") {
      for (const match of content.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)) requireLocalReference(root, file, match[1]);
    }
  }
  const html = readFileSync(join(root, "index.html"), "utf8");
  assert(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/i.test(html), "index.html has no CSS stylesheet link");
  assert(/<script\b[^>]*src=["'][^"']+\.js(?:\?[^"']*)?["']/i.test(html), "index.html has no external JS chunks");
  return { files: files.length, css: css.length, chunks: chunks.length, references };
}

export async function validateExport(root = projectRoot) {
  const config = await validateConfig(root);
  const buildRoot = join(root, config.distDir || ".next");
  const result = validateAssets(join(root, "out"), join(buildRoot, "static"));
  requireFile(join(buildRoot, "BUILD_ID"));
  const build = JSON.parse(readFileSync(join(buildRoot, "required-server-files.json"), "utf8"));
  assert.equal(build.config.output, "export", "Artifacts were not built in export mode");
  assert.equal(build.config.assetPrefix, "./", "Build used the wrong assetPrefix");
  const prerender = JSON.parse(readFileSync(join(buildRoot, "prerender-manifest.json"), "utf8"));
  assert(prerender.routes["/"], "Dashboard was not prerendered");
  assert.equal(Object.keys(prerender.dynamicRoutes).length, 0, "Unresolved dynamic server routes");
  const appRoutes = JSON.parse(readFileSync(join(buildRoot, "server", "app-paths-manifest.json"), "utf8"));
  for (const route of Object.keys(appRoutes)) {
    const publicRoute = route.replace(/\/(?:page|route)$/, "") || "/";
    assert(publicRoute === "/_not-found" || prerender.routes[publicRoute], `Route requires a server: ${route}`);
  }
  const localRoute = readFileSync(join(root, "src", "app", "api", "jira", "route.ts"), "utf8");
  assert(!localRoute.includes(STUB_MARKER), "Local API route was not restored");
  assert(localRoute.includes('dynamic = "force-dynamic"'), "Local API lost its dynamic behavior");
  return result;
}

export async function validateForge(root = projectRoot) {
  const exported = await validateExport(root);
  const resource = resourceDirectory(root);
  const deployed = validateAssets(resource, join(root, ".next", "static"));
  compareTrees(join(root, "out"), resource, "Forge resource");
  return { exported, deployed, resource };
}

export async function main(mode = "forge") {
  if (mode === "export") console.log("[validate:export] PASS", await validateExport());
  else if (mode === "assets") {
    console.log("[validate:assets] PASS", {
      exported: validateAssets(join(projectRoot, "out"), join(projectRoot, ".next", "static")),
      deployed: validateAssets(resourceDirectory(), join(projectRoot, ".next", "static")),
    });
  } else {
    assert.equal(mode, "forge", `Unknown validation mode: ${mode}`);
    console.log("[validate:forge] PASS", await validateForge());
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] || "forge";
  main(mode).catch((error) => {
    console.error(`[validate:${mode}] FAIL: ${error.message}`);
    process.exitCode = 1;
  });
}

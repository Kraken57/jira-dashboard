import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { resourceDirectory, validateAssets } from "./validate-forge.mjs";

const root = resourceDirectory();
validateAssets(root);
const mount = "/resources/app/environment/version/dashboard/";
const port = Number(process.env.FORGE_PREVIEW_PORT || 4173);
const mime = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8" };

const server = createServer((request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'");
  const pathname = new URL(request.url, "http://localhost").pathname;
  if (pathname === "/") {
    response.setHeader("Content-Type", mime[".html"]);
    response.end(`<!doctype html><title>Forge nested-path preview</title><iframe title="Dashboard preview" src="${mount}" style="width:100%;height:95vh;border:0"></iframe>`);
    return;
  }
  if (!pathname.startsWith(mount)) { response.writeHead(404).end("Not a Forge resource URL"); return; }
  let file;
  try { file = resolve(root, decodeURIComponent(pathname.slice(mount.length)) || "index.html"); }
  catch (error) { if (error instanceof URIError) { response.writeHead(400).end("Malformed resource URL"); return; } throw error; }
  if (relative(root, file).startsWith("..")) { response.writeHead(403).end("Resource URL escapes export"); return; }
  try {
    if (statSync(file).isDirectory()) file = join(file, "index.html");
    response.setHeader("Content-Type", mime[extname(file)] || "application/octet-stream");
    response.end(readFileSync(file));
  } catch (error) {
    if (error.code !== "ENOENT" && error.code !== "ENOTDIR") { response.writeHead(500).end("Cannot read resource"); return; }
    response.writeHead(404).end("Resource not found");
  }
});

server.on("error", (error) => { console.error("[preview:forge] FAIL:", error.message); process.exitCode = 1; });
server.listen(port, "127.0.0.1", () => {
  console.log(`[preview:forge] http://127.0.0.1:${port}/`);
  console.log("[preview:forge] Static iframe simulation only; the Atlassian bridge/data is unavailable here.");
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close());

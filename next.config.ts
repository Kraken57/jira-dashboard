import type { NextConfig } from "next";

/**
 * Two build modes:
 *  - default            : full Next.js app (server + /api/jira route) for localhost
 *  - FORGE_BUILD=true   : static export into ./out for the Atlassian Forge Custom UI
 *
 * In Forge mode the frontend talks to the Forge backend over the bridge, so the
 * local /api/jira route is not needed. The route is excluded via
 * `src/app/api/jira/route.ts` returning 404 in export mode is NOT possible, so
 * instead the route file is skipped through `pageExtensions`/aliasing below.
 */
const isForgeBuild = process.env.FORGE_BUILD === "true";

const nextConfig: NextConfig = {
  output: isForgeBuild ? "export" : undefined,
  // Forge Custom UI serves this bundle from a nested path, so asset URLs must
  // be relative ("./_next/..."); absolute "/_next/..." 404s and strips all
  // CSS/JS from the page.
  assetPrefix: isForgeBuild ? "./" : undefined,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

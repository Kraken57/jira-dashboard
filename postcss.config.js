/**
 * Tailwind for the Forge webpack build. `next build --webpack` (used because
 * Turbopack's chunk runtime cannot run inside Forge Custom UI) only runs
 * PostCSS config — the Turbopack loader from next.config.ts is skipped. Next
 * requires a plain object here, so the gate is at module level.
 */
module.exports =
  process.env.FORGE_BUILD === "true"
    ? { plugins: { "@tailwindcss/postcss": {} } }
    : {};

const isForgeBuild = process.env.FORGE_BUILD === "true";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: isForgeBuild ? "export" : undefined,
  // Forge serves Custom UI under a versioned nested resource URL.
  assetPrefix: isForgeBuild ? "./" : undefined,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;

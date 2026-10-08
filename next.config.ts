import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // a stray lockfile in the home folder must not become the workspace root
  turbopack: { root: process.cwd() },
  async headers() {
    return [
      {
        // generated data and city assets change only when CI rebuilds them
        source: "/:dir(city|data)/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" }],
      },
      {
        // content-hashed year packs and summaries never change: keep them for a year
        source: "/data/years/:file((?:\\d{4}|summaries)\\.[0-9a-f]{10}\\..+)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // the showreel and its poster: cached at the edge, refreshed within a day if re-rendered
        source: "/video/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800" }],
      },
      {
        // the list of current files must stay fresh so a new 2026 pack is picked up
        source: "/data/years/index.json",
        headers: [{ key: "Cache-Control", value: "public, max-age=300, s-maxage=600, stale-while-revalidate=86400" }],
      },
    ];
  },
};

export default nextConfig;

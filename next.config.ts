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
    ];
  },
};

export default nextConfig;

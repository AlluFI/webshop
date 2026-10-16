import type { NextConfig } from "next";

const apiProxy =
  process.env.API_PROXY_TARGET ||
  (process.env.DOCKER_STOREFRONT === "1" ? "http://api:3000" : "http://127.0.0.1:3000");

const nextConfig: NextConfig = {
  transpilePackages: ["@volt/shared"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxy}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

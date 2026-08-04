/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/x402-mcp/:path*',
        destination: '/api/mcp/:path*',
      },
    ];
  },

  // Keep production builds lighter on the small VPS.
  experimental: {
    workerThreads: false,
    cpus: 1,
  },
};

export default nextConfig;

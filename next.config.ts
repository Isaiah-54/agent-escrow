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
};

export default nextConfig;

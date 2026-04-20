/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.nationreporters.com' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
  experimental: { serverActions: { allowedOrigins: ['localhost:3000', 'nationreporters.com'] } },
};

module.exports = nextConfig;

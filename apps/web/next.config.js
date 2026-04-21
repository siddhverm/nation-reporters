/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    // Allow all HTTPS sources — needed for RSS feed images from any news publisher
    remotePatterns: [{ protocol: 'https', hostname: '**' }, { protocol: 'http', hostname: 'localhost' }],
  },
  experimental: { serverActions: { allowedOrigins: ['localhost:3000', 'nationreporters.com'] } },
};

module.exports = nextConfig;

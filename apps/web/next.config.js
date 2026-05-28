const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }, { protocol: 'http', hostname: 'localhost' }],
  },
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../../'),
    serverActions: { allowedOrigins: ['localhost:3000', 'nationreporters.com'] },
  },
};

module.exports = nextConfig;

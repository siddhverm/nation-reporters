const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    // Story pictures are same-origin (/story-image, /logo.png). Do not let the image optimizer fetch arbitrary hosts.
    remotePatterns: [{ protocol: 'http', hostname: 'localhost' }],
  },
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../../'),
    serverActions: { allowedOrigins: ['localhost:3000', 'nationreporters.com'] },
  },
};

module.exports = nextConfig;

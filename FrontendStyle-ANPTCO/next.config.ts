import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Tree-shake these large packages instead of bundling entire libraries
    optimizePackageImports: ['aws-amplify', '@aws-amplify/auth', '@aws-amplify/core'],
  },
  async redirects() {
    return [
      { source: '/login',          destination: '/',                     permanent: false },
      { source: '/auth',           destination: '/',                     permanent: false },
      { source: '/driver/signup',  destination: '/auth/signup/transport', permanent: false },
      { source: '/client/signup',  destination: '/auth/signup/client',   permanent: false },
      { source: '/seller/signup',  destination: '/auth/signup/seller',   permanent: false },
    ];
  },
};

module.exports = nextConfig;
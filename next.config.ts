import type { NextConfig } from "next";

/** @type {import('next').NextConfig} */
const nextConfig = {
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
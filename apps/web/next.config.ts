import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@gain/shared'],
  output: 'standalone',
  poweredByHeader: false,
};

export default nextConfig;

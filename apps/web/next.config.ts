import type { NextConfig } from 'next';

// Static export (TECH-SPEC §8): tanpa fitur server; semua data dari public/data/ hasil prebuild.
const nextConfig: NextConfig = {
  output: 'export',
  transpilePackages: ['@gold/schema'],
  images: { unoptimized: true },
};

export default nextConfig;

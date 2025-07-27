import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  transpilePackages: ['@agent-world/core'],
  experimental: {
    esmExternals: 'loose'
  },
  webpack: (config) => {
    // Handle .js extensions for TypeScript files in the core package
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    };
    return config;
  },
};

export default nextConfig;

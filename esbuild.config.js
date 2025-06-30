/**
 * ESBuild Configuration for Agent World
 * 
 * Builds:
 * - Core ESM bundle for browser consumption (excludes Node.js built-ins, includes EventEmitter polyfill)
 * - Server bundle for production deployment  
 * - CLI bundle for distribution
 * - Package bundle for npm distribution
 * 
 * Browser Build Notes:
 * - Excludes all Node.js built-in modules (fs, path, os, crypto, etc.)
 * - Includes EventEmitter polyfill via 'events' package alias
 * - Uses conditional compilation (__IS_BROWSER__) for environment-specific code
 */

import { build } from 'esbuild';
import { resolve } from 'path';

const configurations = [

  // Core ESM Bundle for Browser (public folder for easy importing)
  {
    entryPoints: ['core/index.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    outfile: 'public/core.js',
    minify: false,
    sourcemap: true,
    external: [
      './agent-storage',  // Only exclude storage functions (file system operations)
      'fs',
      'path'
    ],
    define: {
      'process.env.NODE_ENV': '"production"',
      '__IS_BROWSER__': 'true'
    }
  },

  // Package Main Bundle
  {
    entryPoints: ['index.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    outfile: 'dist/index.js',
    external: ['tsx'],
    minify: false,
    sourcemap: true,
    define: {
      '__IS_BROWSER__': 'false'
    }
  }
];

// Build all configurations
async function buildAll() {
  console.log('🔨 Building all bundles...');

  for (const config of configurations) {
    try {
      await build(config);
      console.log(`✅ Built: ${config.outfile}`);
    } catch (error) {
      console.error(`❌ Failed to build ${config.outfile}:`, error);
      process.exit(1);
    }
  }

  console.log('🎉 All bundles built successfully!');
}

// Export configurations for programmatic use
export { configurations };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  buildAll();
}

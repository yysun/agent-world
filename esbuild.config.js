/**
 * ESBuild Configuration for Agent World
 * 
 * Builds:
 * - Core ESM bundle for browser consumption
 * - Server bundle for production deployment  
 * - CLI bundle for distribution
 * - Package bundle for npm distribution
 */

import { build } from 'esbuild';
import { resolve } from 'path';

const configurations = [
  // Core ESM Bundle for Browser
  {
    entryPoints: ['core/index.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    outfile: 'dist/core.esm.js',
    external: ['events', 'fs', 'path', 'uuid'],
    minify: false,
    sourcemap: true,
    define: {
      'process.env.NODE_ENV': '"production"',
      '__IS_BROWSER__': 'true'
    }
  },

  // Server Bundle
  {
    entryPoints: ['server/index.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    outfile: 'dist/server.js',
    external: ['tsx'],
    minify: false,
    sourcemap: true
  },

  // CLI Bundle
  {
    entryPoints: ['bin/cli.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    outfile: 'dist/cli.js',
    external: ['tsx', 'terminal-kit'],
    minify: false,
    sourcemap: true,
    banner: {
      js: '#!/usr/bin/env node'
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

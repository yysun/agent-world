#!/usr/bin/env npx tsx

/**
 * Agent World CLI Entry Point
 * 
 * Features:
 * - Pure CLI interface without server mixing
 * - Interactive command line tool for agent management
 * - Real-time streaming and agent communication
 * - Clean separation from server functionality
 * 
 * Usage:
 * - npm run cli
 * - npx agent-world (after global install)
 */

// Set the data path for core modules
if (!process.env.AGENT_WORLD_DATA_PATH) {
  process.env.AGENT_WORLD_DATA_PATH = './data/worlds';
}

// Import and run the CLI directly
import('../cli/index').catch((error) => {
  console.error('Failed to start CLI:', error);
  process.exit(1);
});

#!/usr/bin/env npx tsx

/**
 * Agent World Server Entry Point
 * 
 * Features:
 * - Pure web server startup without CLI mixing
 * - Express.js REST API and WebSocket communication
 * - Static file serving from public directory
 * - Clean separation from CLI functionality
 * 
 * Usage:
 * - npm run server
 * - npx agent-world-server (after global install)
 */

// Set the data path for core modules
if (!process.env.AGENT_WORLD_DATA_PATH) {
  process.env.AGENT_WORLD_DATA_PATH = './data/worlds';
}

// Import and start the server directly
import('../server/index').then((module) => {
  return module.startWebServer();
}).then((server) => {
  console.log('✅ Server started successfully');

  // Handle graceful shutdown
  const shutdown = () => {
    console.log('\n🛑 Shutting down server...');
    server.close(() => {
      console.log('👋 Server stopped');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}).catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

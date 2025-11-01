/**
 * WebSocket Server Entry Point
 * 
 * Starts the WebSocket server for async agent message processing
 */

import { AgentWorldWSServer } from './ws-server.js';
import { QueueProcessor, createQueueProcessor } from './queue-processor.js';
import { createSQLiteEventStorage } from '../core/storage/eventStorage/index.js';
import { createSQLiteQueueStorage } from '../core/storage/queue-storage.js';
import { createSQLiteSchemaContext } from '../core/storage/sqlite-schema.js';

const PORT = parseInt(process.env.WS_PORT || '3001', 10);
const DB_PATH = process.env.DB_PATH || './data/agent-world.db';
const WORLDS_BASE_PATH = process.env.WORLDS_BASE_PATH || './data';

async function main() {
  console.log('Starting Agent World WebSocket Server...');
  console.log(`Database: ${DB_PATH}`);
  console.log(`Port: ${PORT}`);
  console.log(`Worlds Base Path: ${WORLDS_BASE_PATH}`);

  // Initialize database
  const { db } = await createSQLiteSchemaContext({ database: DB_PATH });

  // Create storage instances
  const eventStorage = await createSQLiteEventStorage(db);
  const queueStorage = createSQLiteQueueStorage({ db });

  // Create and start WebSocket server
  const server = new AgentWorldWSServer({
    port: PORT,
    eventStorage,
    queueStorage,
    heartbeatInterval: 30000,  // 30 seconds
    heartbeatTimeout: 60000    // 60 seconds
  });

  await server.start();
  console.log(`WebSocket server started on port ${PORT}`);

  // Create and start queue processor
  const processor = createQueueProcessor({
    queueStorage,
    wsServer: server,
    pollInterval: 1000,        // Poll every second
    heartbeatInterval: 5000,   // Update heartbeat every 5 seconds
    maxConcurrent: 5,          // Process up to 5 worlds concurrently
    worldsBasePath: WORLDS_BASE_PATH
  });

  processor.start();
  console.log('Queue processor started');

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    await processor.stop();
    await server.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');
    await processor.stop();
    await server.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Failed to start WebSocket server:', error);
  process.exit(1);
});

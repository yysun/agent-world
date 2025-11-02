/**
 * WebSocket Server Entry Point
 * 
 * Purpose: Starts the WebSocket server for async agent message processing
 * 
 * Features:
 * - Environment variable configuration for all settings
 * - SQLite or in-memory storage backend
 * - Configurable logging with hierarchical categories
 * - Graceful shutdown handling
 * - Health check endpoint
 * - Uses same default paths as API server (~/agent-world)
 * 
 * Environment Variables:
 * - WS_PORT: WebSocket server port (default: 3001)
 * - AGENT_WORLD_STORAGE_TYPE: Storage backend type - 'sqlite' or 'memory' (default: memory)
 * - AGENT_WORLD_SQLITE_DATABASE: SQLite database path (default: ~/agent-world/database.db)
 * - AGENT_WORLD_DATA_PATH: Base path for world data (default: ~/agent-world)
 * - WS_HEARTBEAT_INTERVAL: Client heartbeat interval in ms (default: 30000)
 * - WS_HEARTBEAT_TIMEOUT: Client heartbeat timeout in ms (default: 60000)
 * - WS_POLL_INTERVAL: Queue polling interval in ms (default: 1000)
 * - WS_PROCESSOR_HEARTBEAT: Processor heartbeat update interval in ms (default: 5000)
 * - WS_MAX_CONCURRENT: Max concurrent world processing (default: 5)
 * - LOG_LEVEL: Global log level - trace, debug, info, warn, error (default: error)
 * - LOG_WS: WS-specific log level (overrides LOG_LEVEL for ws.* categories)
 * 
 * Changes:
 * - 2025-11-01: Initial WebSocket server implementation
 * - 2025-11-01: Add comprehensive environment variable configuration
 * - 2025-11-01: Fix startup visibility - use console.log for config/status messages since default log level is 'error'
 * - 2025-11-01: Fix database path consistency - use getDefaultRootPath() to match API server (~/agent-world instead of ./data)
 * - 2025-11-01: Replace SQL queue with in-memory queue storage (simpler, no persistence needed)
 */

import { AgentWorldWSServer } from './ws-server.js';
import { QueueProcessor, createQueueProcessor } from './queue-processor.js';
import { createSQLiteEventStorage, createMemoryEventStorage } from '../core/storage/eventStorage/index.js';
import { createMemoryQueueStorage } from '../core/storage/queue-storage.js';
import { createSQLiteSchemaContext } from '../core/storage/sqlite-schema.js';
import { initializeLogger, createCategoryLogger } from '../core/logger.js';
import { getDefaultRootPath } from '../core/storage/storage-factory.js';
import path from 'path';
import type { EventStorage } from '../core/storage/eventStorage/types.js';
import type { QueueStorage } from '../core/storage/queue-storage.js';

// Initialize logger with environment variables
initializeLogger();

const logger = createCategoryLogger('ws.server');
const configLogger = createCategoryLogger('ws.config');

// Get default root path using the same logic as API server
const rootPath = getDefaultRootPath();

// Read configuration from environment variables
const config = {
  port: parseInt(process.env.WS_PORT || '3001', 10),
  storageType: (process.env.AGENT_WORLD_STORAGE_TYPE || 'memory') as 'sqlite' | 'memory',
  dbPath: process.env.AGENT_WORLD_SQLITE_DATABASE || path.join(rootPath, 'database.db'),
  worldsBasePath: process.env.AGENT_WORLD_DATA_PATH || rootPath,
  heartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL || '30000', 10),
  heartbeatTimeout: parseInt(process.env.WS_HEARTBEAT_TIMEOUT || '60000', 10),
  pollInterval: parseInt(process.env.WS_POLL_INTERVAL || '1000', 10),
  processorHeartbeat: parseInt(process.env.WS_PROCESSOR_HEARTBEAT || '5000', 10),
  maxConcurrent: parseInt(process.env.WS_MAX_CONCURRENT || '5', 10)
};

/**
 * Initialize storage
 */
async function initializeStorage(): Promise<{
  eventStorage: EventStorage;
  queueStorage: QueueStorage;
}> {
  const storageLogger = createCategoryLogger('ws.storage');
  storageLogger.info(`Initializing ${config.storageType} storage...`);

  // Queue storage is always in-memory (simple and sufficient)
  const queueStorage = createMemoryQueueStorage();
  storageLogger.info('Using in-memory queue storage');

  if (config.storageType === 'memory') {
    storageLogger.info('Using in-memory event storage (data will not persist)');
    return {
      eventStorage: createMemoryEventStorage(),
      queueStorage
    };
  }

  // SQLite event storage
  storageLogger.info(`Database path: ${config.dbPath}`);
  const { db } = await createSQLiteSchemaContext({ database: config.dbPath });
  storageLogger.info('SQLite database initialized successfully');

  return {
    eventStorage: await createSQLiteEventStorage(db),
    queueStorage
  };
}

/**
 * Main entry point
 */
async function main() {
  logger.info('Starting Agent World WebSocket Server...');

  try {
    // Initialize storage
    const { eventStorage, queueStorage } = await initializeStorage();

    // Create and start WebSocket server
    const server = new AgentWorldWSServer({
      port: config.port,
      eventStorage,
      queueStorage,
      heartbeatInterval: config.heartbeatInterval,
      heartbeatTimeout: config.heartbeatTimeout
    });

    await server.start();
    console.log(`✓ WebSocket server started on port ${config.port}`);
    logger.info(`WebSocket server started successfully on port ${config.port}`);

    // Create and start queue processor
    const processor = createQueueProcessor({
      queueStorage,
      wsServer: server,
      pollInterval: config.pollInterval,
      heartbeatInterval: config.processorHeartbeat,
      maxConcurrent: config.maxConcurrent,
      worldsBasePath: config.worldsBasePath
    });

    processor.start();
    console.log('✓ Queue processor started');
    console.log('✓ Server ready to accept connections\n');
    logger.info('Queue processor started successfully');
    logger.info('WebSocket server ready to accept connections');

    // Handle graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully...`);
      try {
        await processor.stop();
        logger.info('Queue processor stopped');
        await server.stop();
        logger.info('WebSocket server stopped');
        logger.info('Shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start WebSocket server:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error('Unhandled error in main:', error);
  process.exit(1);
});

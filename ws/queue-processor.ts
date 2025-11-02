/**
 * Queue Processor - Async Message Processing Worker
 * 
 * Purpose: Worker that dequeues messages and processes them through agent worlds
 * 
 * Features:
 * - Per-world sequential message processing
 * - Heartbeat updates during long-running operations
 * - Automatic retry on failures with exponential backoff
 * - Real-time event broadcasting via WebSocket
 * - Status updates (processing/completed/failed)
 * - Graceful shutdown with in-flight message handling
 * - Structured logging with ws.processor category
 * 
 * Architecture:
 * - Polling loop with configurable interval
 * - Per-world locking prevents concurrent processing
 * - Integrates with World class for agent processing
 * - Broadcasts events through WebSocket server
 * - Updates queue status via QueueStorage
 * - World instance reused across all messages for efficiency
 * 
 * Processing Flow:
 * 1. Poll queue for pending messages
 * 2. Load world instance ONCE per world
 * 3. Process all queued messages for that world
 * 4. Update heartbeat during processing
 * 5. Process each message through world.sendMessage()
 * 6. Capture and broadcast all events
 * 7. Mark completed or failed with retry logic
 * 8. Destroy world instance after all messages processed
 * 9. Broadcast final status
 * 
 * Changes:
 * - 2025-11-02: Fix message processing - reuse world instance across all messages instead of loading/destroying per message
 * - 2025-11-02: Update event broadcasting to use clean format (type + payload structure)
 * - 2025-11-01: Initial queue processor implementation
 * - 2025-11-01: Replace console.log with structured logger
 */

import type { QueueStorage, QueueMessage } from '../core/storage/queue-storage.js';
import type { AgentWorldWSServer } from './ws-server.js';
import type { World } from '../core/types.js';
import { getWorld } from '../core/managers.js';
import { publishMessageWithId } from '../core/events.js';
import { EventType } from '../core/types.js';
import { createCategoryLogger } from '../core/logger.js';
import { startWorld, type ClientConnection, type WorldSubscription } from '../core/subscription.js';

const logger = createCategoryLogger('ws.processor');

/**
 * Queue processor configuration
 */
export interface QueueProcessorConfig {
  queueStorage: QueueStorage;
  wsServer: AgentWorldWSServer;
  pollInterval?: number;        // ms between polls (default 1000)
  heartbeatInterval?: number;   // ms between heartbeats (default 5000)
  maxConcurrent?: number;       // max worlds processing at once (default 5)
  worldsBasePath?: string;      // base path for world data (default './data')
}

/**
 * Queue processor worker
 */
export class QueueProcessor {
  private config: Required<QueueProcessorConfig>;
  private running = false;
  private pollTimer?: NodeJS.Timeout;
  private processingWorlds = new Set<string>();
  private shutdownPromise?: Promise<void>;
  private shutdownResolve?: () => void;

  constructor(config: QueueProcessorConfig) {
    this.config = {
      ...config,
      pollInterval: config.pollInterval ?? 1000,
      heartbeatInterval: config.heartbeatInterval ?? 5000,
      maxConcurrent: config.maxConcurrent ?? 5,
      worldsBasePath: config.worldsBasePath ?? './data'
    };
  }

  /**
   * Start the queue processor
   */
  public start(): void {
    if (this.running) {
      logger.debug('Already running');
      return;
    }

    this.running = true;
    logger.info('Starting queue processor...');
    this.schedulePoll();
  }

  /**
   * Stop the queue processor gracefully
   */
  public async stop(): Promise<void> {
    if (!this.running) return;

    logger.info('Stopping queue processor...');
    this.running = false;

    // Clear poll timer
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }

    // Wait for in-flight processing to complete
    if (this.processingWorlds.size > 0) {
      logger.info(`Waiting for ${this.processingWorlds.size} worlds to finish processing...`);
      this.shutdownPromise = new Promise((resolve) => {
        this.shutdownResolve = resolve;
      });
      await this.shutdownPromise;
    }

    logger.info('Queue processor stopped');
  }

  /**
   * Schedule next poll
   */
  private schedulePoll(): void {
    if (!this.running) return;

    this.pollTimer = setTimeout(() => {
      this.poll().catch((error) => {
        logger.error('Poll error:', error);
      }).finally(() => {
        this.schedulePoll();
      });
    }, this.config.pollInterval);
  }

  /**
   * Poll for messages and process them
   */
  private async poll(): Promise<void> {
    // Check if we're at max concurrency
    if (this.processingWorlds.size >= this.config.maxConcurrent) {
      return;
    }

    // Get queue statistics to find worlds with pending messages
    const stats = await this.config.queueStorage.getQueueStats();    // stats is an array of WorldQueueStats, not an object
    for (const worldStats of stats) {
      const worldId = worldStats.worldId;

      // Skip if world is already processing
      if (this.processingWorlds.has(worldId)) {
        continue;
      }

      // Skip if no pending messages
      if (worldStats.pending === 0) {
        continue;
      }

      // Check concurrency limit
      if (this.processingWorlds.size >= this.config.maxConcurrent) {
        break;
      }

      // Start processing this world
      logger.info(`📨 Poll detected ${worldStats.pending} pending message(s) for world: ${worldId}`);
      this.processWorld(worldId).catch((error) => {
        logger.error(`Error processing world ${worldId}:`, error);
      });
    }
  }

  /**
   * Process all messages for a specific world
   */
  private async processWorld(worldId: string): Promise<void> {
    this.processingWorlds.add(worldId);

    // Load world instance ONCE for all messages
    let subscription: WorldSubscription | null = null;

    try {
      logger.info(`Loading world instance: ${worldId}`);
      const world = await getWorld(worldId);
      if (!world) {
        throw new Error(`World ${worldId} not found`);
      }
      logger.info(`World loaded: ${worldId} with ${world.agents.size} agents`);

      // Create a minimal ClientConnection for startWorld (no event forwarding needed)
      const dummyClient: ClientConnection = {
        isOpen: true
      };

      // Use startWorld to properly initialize world with agent subscriptions
      subscription = await startWorld(world, dummyClient);

      // Process messages one at a time until queue is empty
      while (this.running) {
        // Dequeue next message for this world
        const message = await this.config.queueStorage.dequeue(worldId);

        if (!message) {
          // No more messages for this world right now
          logger.info(`✓ No more messages for world: ${worldId} - exiting batch processing`);
          break;
        }

        logger.info(`📬 Dequeued message for world: ${worldId}`, {
          messageId: message.messageId,
          queueId: message.id,
          content: message.content.substring(0, 50)
        });

        // Process the message using the loaded world instance
        await this.processMessage(message, subscription.world);
        logger.info(`✓ Finished processing message ${message.messageId}`);
      }
    } catch (error) {
      logger.error(`Error processing world ${worldId}:`, error);
    } finally {
      // Clean up world subscription after ALL messages are processed
      if (subscription) {
        logger.info(`🧹 Destroying world subscription for: ${worldId}`);
        await subscription.destroy();
      }

      // IMPORTANT: Remove from processing BEFORE checking if there are more messages
      // This allows the next poll to pick up any new messages that arrived
      this.processingWorlds.delete(worldId);

      logger.info(`✅ Finished processing batch for world: ${worldId}`);

      // If shutting down and all processing complete, resolve shutdown promise
      if (!this.running && this.processingWorlds.size === 0 && this.shutdownResolve) {
        this.shutdownResolve();
      }
    }
  }

  /**
   * Process a single message with a loaded world instance
   */
  private async processMessage(message: QueueMessage, world: World): Promise<void> {
    const { worldId, messageId, chatId, content, sender } = message;

    logger.info(`Processing message ${messageId} for world ${worldId}`, { content, sender });

    // Broadcast processing status
    this.config.wsServer.broadcastStatus(worldId, messageId, 'processing');

    // Start heartbeat updates
    const heartbeatTimer = setInterval(async () => {
      try {
        await this.config.queueStorage.updateHeartbeat(message.id);
      } catch (error) {
        logger.error('Heartbeat update failed:', error);
      }
    }, this.config.heartbeatInterval);

    try {
      // Set up event listeners to broadcast events in real-time
      const messageListener = (event: any) => {
        // Broadcast regular message events
        logger.debug(`[EVENT] Message event received`, { worldId, messageId, sender: event.sender });
        // Wrap message event - payload contains the message data
        this.config.wsServer.broadcastEvent(worldId, chatId, { type: 'message', payload: event });
      };

      const worldListener = (event: any) => {
        // Broadcast world events (system, tools, etc)
        logger.debug(`[EVENT] World event received`, { worldId, messageId, eventType: event.type });
        // Wrap world event - payload contains the actual world event data
        this.config.wsServer.broadcastEvent(worldId, chatId, { type: 'world', payload: event });
      };

      const sseListener = (event: any) => {
        // Broadcast SSE events (streaming LLM responses)
        logger.debug(`[EVENT] SSE event received`, { worldId, messageId, eventType: event.type, agentName: event.agentName });
        // SSE events (start, chunk, end, error) - keep original type in payload
        this.config.wsServer.broadcastEvent(worldId, chatId, { type: 'sse', payload: event });
      };

      const crudListener = (event: any) => {
        // Broadcast CRUD events (config changes)
        logger.debug(`[EVENT] CRUD event received`, { worldId, operation: event.operation });
        this.config.wsServer.broadcastCRUDEvent(worldId, event);
      };

      // Subscribe to event broadcasts
      world.eventEmitter.on(EventType.MESSAGE, messageListener);
      world.eventEmitter.on(EventType.WORLD, worldListener);
      world.eventEmitter.on(EventType.SSE, sseListener);
      world.eventEmitter.on(EventType.CRUD, crudListener);

      try {
        // Process message through world by publishing it
        logger.info(`Publishing message to world: ${worldId}`, { messageId, sender });
        publishMessageWithId(world, content, sender, messageId, chatId ?? null);

        // Wait for world to become idle (processing complete)
        logger.info(`Waiting for world ${worldId} to become idle`);
        await this.waitForWorldIdle(world);

        // Mark as completed
        await this.config.queueStorage.markCompleted(message.id);
        this.config.wsServer.broadcastStatus(worldId, messageId, 'completed');

        logger.info(`✓ Completed message ${messageId} for world ${worldId}`);
      } finally {
        // Unsubscribe from events
        world.eventEmitter.off(EventType.MESSAGE, messageListener);
        world.eventEmitter.off(EventType.WORLD, worldListener);
        world.eventEmitter.off(EventType.SSE, sseListener);
        world.eventEmitter.off(EventType.CRUD, crudListener);
      }
    } catch (error) {
      logger.error(`Failed to process message ${messageId}:`, error);

      const errorMessage = error instanceof Error ? error.message : String(error);

      // Mark as failed
      await this.config.queueStorage.markFailed(message.id, errorMessage);
      this.config.wsServer.broadcastStatus(worldId, messageId, 'failed', errorMessage);

      logger.info(`Failed message ${messageId} for world ${worldId}: ${errorMessage}`);
    } finally {
      // Stop heartbeat updates
      clearInterval(heartbeatTimer);
    }
  }

  /**
   * Wait for world to become idle (processing complete)
   */
  private async waitForWorldIdle(world: World): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Processing timeout - world did not become idle within 60 seconds'));
      }, 60000);

      const activityListener = (eventData: any) => {
        if (eventData.type === 'idle') {
          clearTimeout(timeout);
          world.eventEmitter.off(EventType.WORLD, activityListener);
          resolve();
        }
      };

      world.eventEmitter.on(EventType.WORLD, activityListener);
    });
  }

  /**
   * Get processor statistics
   */
  public getStats(): {
    running: boolean;
    processingWorlds: number;
    activeWorlds: string[];
  } {
    return {
      running: this.running,
      processingWorlds: this.processingWorlds.size,
      activeWorlds: Array.from(this.processingWorlds)
    };
  }
}

/**
 * Create queue processor instance
 */
export function createQueueProcessor(config: QueueProcessorConfig): QueueProcessor {
  return new QueueProcessor(config);
}

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
 * 
 * Architecture:
 * - Polling loop with configurable interval
 * - Per-world locking prevents concurrent processing
 * - Integrates with World class for agent processing
 * - Broadcasts events through WebSocket server
 * - Updates queue status via QueueStorage
 * 
 * Processing Flow:
 * 1. Poll queue for pending messages
 * 2. Dequeue message (atomic per-world lock)
 * 3. Load world instance
 * 4. Update heartbeat during processing
 * 5. Process message through world.sendMessage()
 * 6. Capture and broadcast all events
 * 7. Mark completed or failed with retry logic
 * 8. Broadcast final status
 * 
 * Changes:
 * - 2025-11-01: Initial queue processor implementation
 */

import type { QueueStorage, QueueMessage } from '../core/storage/queue-storage.js';
import type { AgentWorldWSServer } from './ws-server.js';
import type { World } from '../core/types.js';
import { getWorld } from '../core/managers.js';
import { publishMessageWithId } from '../core/events.js';
import { EventType } from '../core/types.js';

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
      console.log('[QueueProcessor] Already running');
      return;
    }

    this.running = true;
    console.log('[QueueProcessor] Starting...');
    this.schedulePoll();
  }

  /**
   * Stop the queue processor gracefully
   */
  public async stop(): Promise<void> {
    if (!this.running) return;

    console.log('[QueueProcessor] Stopping...');
    this.running = false;

    // Clear poll timer
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }

    // Wait for in-flight processing to complete
    if (this.processingWorlds.size > 0) {
      console.log(`[QueueProcessor] Waiting for ${this.processingWorlds.size} worlds to finish processing...`);
      this.shutdownPromise = new Promise((resolve) => {
        this.shutdownResolve = resolve;
      });
      await this.shutdownPromise;
    }

    console.log('[QueueProcessor] Stopped');
  }

  /**
   * Schedule next poll
   */
  private schedulePoll(): void {
    if (!this.running) return;

    this.pollTimer = setTimeout(() => {
      this.poll().catch((error) => {
        console.error('[QueueProcessor] Poll error:', error);
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
    const stats = await this.config.queueStorage.getQueueStats();

    for (const [worldId, worldStats] of Object.entries(stats)) {
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
      this.processWorld(worldId).catch((error) => {
        console.error(`[QueueProcessor] Error processing world ${worldId}:`, error);
      });
    }
  }

  /**
   * Process all messages for a specific world
   */
  private async processWorld(worldId: string): Promise<void> {
    this.processingWorlds.add(worldId);

    try {
      while (this.running) {
        // Dequeue next message for this world
        const message = await this.config.queueStorage.dequeue(worldId);

        if (!message) {
          // No more messages for this world
          break;
        }

        // Process the message
        await this.processMessage(message);
      }
    } finally {
      this.processingWorlds.delete(worldId);

      // If shutting down and all processing complete, resolve shutdown promise
      if (!this.running && this.processingWorlds.size === 0 && this.shutdownResolve) {
        this.shutdownResolve();
      }
    }
  }

  /**
   * Process a single message
   */
  private async processMessage(message: QueueMessage): Promise<void> {
    const { worldId, messageId, chatId, content, sender } = message;

    console.log(`[QueueProcessor] Processing message ${messageId} for world ${worldId}`);

    // Broadcast processing status
    this.config.wsServer.broadcastStatus(worldId, messageId, 'processing');

    // Start heartbeat updates
    const heartbeatTimer = setInterval(async () => {
      try {
        await this.config.queueStorage.updateHeartbeat(message.id);
      } catch (error) {
        console.error('[QueueProcessor] Heartbeat update failed:', error);
      }
    }, this.config.heartbeatInterval);

    try {
      // Load world instance
      const world = await this.loadWorldInstance(worldId);

      // Set up event listener to broadcast events in real-time
      const eventListener = (event: any) => {
        // Only broadcast persisted events that have seq numbers
        if (event.seq !== undefined) {
          this.config.wsServer.broadcastEvent(worldId, chatId, event);
        }
      };

      // Subscribe to persisted event broadcasts
      world.eventEmitter.on('event', eventListener);

      try {
        // Process message through world by publishing it
        publishMessageWithId(world, content, sender, messageId, chatId ?? null);

        // Wait for world to become idle (processing complete)
        await this.waitForWorldIdle(world);

        // Mark as completed
        await this.config.queueStorage.markCompleted(message.id);
        this.config.wsServer.broadcastStatus(worldId, messageId, 'completed');

        console.log(`[QueueProcessor] Completed message ${messageId} for world ${worldId}`);
      } finally {
        // Unsubscribe from events
        world.eventEmitter.off('event', eventListener);
      }
    } catch (error) {
      console.error(`[QueueProcessor] Failed to process message ${messageId}:`, error);

      const errorMessage = error instanceof Error ? error.message : String(error);

      // Mark as failed
      await this.config.queueStorage.markFailed(message.id, errorMessage);
      this.config.wsServer.broadcastStatus(worldId, messageId, 'failed', errorMessage);

      console.log(`[QueueProcessor] Failed message ${messageId} for world ${worldId}: ${errorMessage}`);
    } finally {
      // Stop heartbeat updates
      clearInterval(heartbeatTimer);
    }
  }

  /**
   * Load world instance from storage
   */
  private async loadWorldInstance(worldId: string): Promise<World> {
    try {
      const world = await getWorld(worldId);
      if (!world) {
        throw new Error(`World ${worldId} not found`);
      }
      return world;
    } catch (error) {
      throw new Error(`Failed to load world ${worldId}: ${error instanceof Error ? error.message : String(error)}`);
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

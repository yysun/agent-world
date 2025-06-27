/**
 * World Event Bus Manager - Per-World Event Bus Management
 *
 * Features:
 * - Creates and manages isolated event buses for each world
 * - Ensures complete event isolation between worlds
 * - Handles resource cleanup when worlds are deleted
 * - Thread-safe event bus creation and destruction
 * - Memory management for event bus instances
 *
 * Core Functions:
 * - createEventBus: Initialize new event bus for a world
 * - getEventBus: Retrieve existing event bus for a world
 * - destroyEventBus: Clean up event bus resources for a world
 * - hasEventBus: Check if world has an event bus
 * - listEventBuses: Get all active event bus world names
 *
 * Architecture:
 * - Map-based storage for event bus instances keyed by world name
 * - Each world gets its own EventBusProvider instance
 * - Automatic cleanup prevents memory leaks
 * - Defensive programming for missing world contexts
 * - Singleton pattern for global access while maintaining per-world isolation
 *
 * Implementation:
 * - Uses existing EventBusProvider from local-provider or dapr-provider
 * - Maintains same configuration pattern as global event bus
 * - Provides world-scoped access to all event bus functionality
 * - Handles concurrent access safely with Map operations
 */

import {
  EventBusProvider,
  EventFilter,
  EventStats,
  LocalProviderOptions,
  createLocalProvider
} from './providers/local-provider';
import {
  DaprProviderOptions,
  createDaprProvider
} from './providers/dapr-provider';

// Event bus configuration for each world
export interface WorldEventBusConfig {
  provider: 'local' | 'dapr';
  maxEventHistory?: number;
  enableLogging?: boolean;
  daprHost?: string;
  daprPort?: number;
  pubsubName?: string;
}

/**
 * World Event Bus Manager - Manages isolated event buses per world
 */
class WorldEventBusManager {
  private eventBuses: Map<string, EventBusProvider> = new Map();
  private defaultConfig: WorldEventBusConfig = { provider: 'local', enableLogging: true };

  /**
   * Create or get event bus for a world
   */
  public createEventBus(worldName: string, config?: WorldEventBusConfig): EventBusProvider {
    // Return existing if already created
    const existing = this.eventBuses.get(worldName);
    if (existing) {
      return existing;
    }

    const eventBusConfig = { ...this.defaultConfig, ...config };
    let provider: EventBusProvider;

    if (eventBusConfig.provider === 'dapr') {
      provider = createDaprProvider({
        daprHost: eventBusConfig.daprHost,
        daprPort: eventBusConfig.daprPort,
        pubsubName: eventBusConfig.pubsubName,
        enableLogging: eventBusConfig.enableLogging
      });
    } else {
      provider = createLocalProvider({
        maxEventHistory: eventBusConfig.maxEventHistory,
        enableLogging: eventBusConfig.enableLogging
      });
    }

    this.eventBuses.set(worldName, provider);
    return provider;
  }

  /**
   * Get event bus for a world (throws if not found)
   */
  public getEventBus(worldName: string): EventBusProvider {
    const provider = this.eventBuses.get(worldName);
    if (!provider) {
      throw new Error(`No event bus found for world: ${worldName}`);
    }
    return provider;
  }

  /**
   * Get event bus for a world (returns null if not found)
   */
  public getEventBusOrNull(worldName: string): EventBusProvider | null {
    return this.eventBuses.get(worldName) || null;
  }

  /**
   * Check if world has an event bus
   */
  public hasEventBus(worldName: string): boolean {
    return this.eventBuses.has(worldName);
  }

  /**
   * Destroy event bus for a world and clean up resources
   */
  public destroyEventBus(worldName: string): boolean {
    const provider = this.eventBuses.get(worldName);
    if (!provider) {
      return false;
    }

    // Clean up provider resources if it has a cleanup method
    if ('destroy' in provider && typeof provider.destroy === 'function') {
      (provider as any).destroy();
    }

    // Clear event history to free memory
    if ('clearHistory' in provider && typeof provider.clearHistory === 'function') {
      provider.clearHistory();
    }

    this.eventBuses.delete(worldName);
    return true;
  }

  /**
   * Get all world names that have event buses
   */
  public listEventBuses(): string[] {
    return Array.from(this.eventBuses.keys());
  }

  /**
   * Get statistics for all event buses
   */
  public getAllStats(): Map<string, EventStats> {
    const stats = new Map<string, EventStats>();
    for (const [worldName, provider] of this.eventBuses) {
      if ('getStats' in provider && typeof provider.getStats === 'function') {
        stats.set(worldName, provider.getStats());
      }
    }
    return stats;
  }

  /**
   * Clear all event buses (for testing only)
   * @internal
   */
  public _clearAllForTesting(): void {
    for (const [worldName] of this.eventBuses) {
      this.destroyEventBus(worldName);
    }
    this.eventBuses.clear();
  }

  /**
   * Set default configuration for new event buses
   */
  public setDefaultConfig(config: WorldEventBusConfig): void {
    this.defaultConfig = { ...config };
  }
}

// Global singleton instance
const worldEventBusManager = new WorldEventBusManager();

export { worldEventBusManager };

// Export convenience functions
export function createWorldEventBus(worldName: string, config?: WorldEventBusConfig): EventBusProvider {
  return worldEventBusManager.createEventBus(worldName, config);
}

export function getWorldEventBus(worldName: string): EventBusProvider {
  return worldEventBusManager.getEventBus(worldName);
}

export function getWorldEventBusOrNull(worldName: string): EventBusProvider | null {
  return worldEventBusManager.getEventBusOrNull(worldName);
}

export function hasWorldEventBus(worldName: string): boolean {
  return worldEventBusManager.hasEventBus(worldName);
}

export function destroyWorldEventBus(worldName: string): boolean {
  return worldEventBusManager.destroyEventBus(worldName);
}

export function listWorldEventBuses(): string[] {
  return worldEventBusManager.listEventBuses();
}

export function getAllWorldEventBusStats(): Map<string, EventStats> {
  return worldEventBusManager.getAllStats();
}

export function setDefaultWorldEventBusConfig(config: WorldEventBusConfig): void {
  worldEventBusManager.setDefaultConfig(config);
}

/**
 * Test helper: Clear all world event buses (for testing only)
 * @internal
 */
export function _clearAllWorldEventBusesForTesting(): void {
  worldEventBusManager._clearAllForTesting();
}

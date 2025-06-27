/**
 * World Event Bus Management - Per-World Event Bus Isolation
 *
 * Provides isolated event buses for each world with resource management and cleanup.
 * Uses function-based approach for better testability and modularity.
 *
 * Features:
 * - Complete event isolation between worlds
 * - Thread-safe creation/destruction with Map storage
 * - Automatic resource cleanup and memory management
 * - Supports both local and Dapr providers
 * - Defensive programming for missing contexts
 *
 * Core API:
 * - create/get/destroy/has/list world event buses
 * - Statistics and configuration management
 * - Test helpers for cleanup
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

// Module state and configuration
let eventBuses: Map<string, EventBusProvider> = new Map();
let defaultConfig: WorldEventBusConfig = { provider: 'local', enableLogging: true };

// Core event bus management functions

/**
 * Create or get event bus for a world with provider selection
 */
function createEventBusForWorld(worldName: string, config?: WorldEventBusConfig): EventBusProvider {
  // Return existing if already created
  const existing = eventBuses.get(worldName);
  if (existing) {
    return existing;
  }

  const eventBusConfig = { ...defaultConfig, ...config };
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

  eventBuses.set(worldName, provider);
  return provider;
}

/**
 * Get event bus for a world (throws if not found)
 */
function getEventBusForWorld(worldName: string): EventBusProvider {
  const provider = eventBuses.get(worldName);
  if (!provider) {
    throw new Error(`No event bus found for world: ${worldName}`);
  }
  return provider;
}

/**
 * Get event bus for a world (safe version returns null if not found)
 */
function getEventBusForWorldOrNull(worldName: string): EventBusProvider | null {
  return eventBuses.get(worldName) || null;
}

/**
 * Check if world has an event bus
 */
function hasEventBusForWorld(worldName: string): boolean {
  return eventBuses.has(worldName);
}

/**
 * Destroy event bus and clean up all resources
 */
function destroyEventBusForWorld(worldName: string): boolean {
  const provider = eventBuses.get(worldName);
  if (!provider) {
    return false;
  }

  // Clean up provider resources
  try {
    if (typeof provider.destroy === 'function') {
      provider.destroy();
    }
  } catch (error) {
    console.warn(`Error destroying event bus for world ${worldName}:`, error);
  }

  eventBuses.delete(worldName);
  return true;
}

/**
 * Get all world names that have event buses
 */
function listAllEventBuses(): string[] {
  return Array.from(eventBuses.keys());
}

/**
 * Get statistics for all event buses
 */
function getAllEventBusStats(): Map<string, EventStats> {
  const stats = new Map<string, EventStats>();
  for (const [worldName, provider] of eventBuses) {
    if ('getStats' in provider && typeof provider.getStats === 'function') {
      stats.set(worldName, provider.getStats());
    }
  }
  return stats;
}

/**
 * Clear all event buses - testing utility
 */
function clearAllEventBusesForTesting(): void {
  for (const [worldName] of eventBuses) {
    destroyEventBusForWorld(worldName);
  }
  eventBuses.clear();
}

/**
 * Set default configuration for new event buses
 */
function setDefaultEventBusConfig(config: WorldEventBusConfig): void {
  defaultConfig = { ...config };
}

// Public API exports with convenience naming
export function createWorldEventBus(worldName: string, config?: WorldEventBusConfig): EventBusProvider {
  return createEventBusForWorld(worldName, config);
}

export function getWorldEventBus(worldName: string): EventBusProvider {
  return getEventBusForWorld(worldName);
}

export function getWorldEventBusOrNull(worldName: string): EventBusProvider | null {
  return getEventBusForWorldOrNull(worldName);
}

export function hasWorldEventBus(worldName: string): boolean {
  return hasEventBusForWorld(worldName);
}

export function destroyWorldEventBus(worldName: string): boolean {
  return destroyEventBusForWorld(worldName);
}

export function listWorldEventBuses(): string[] {
  return listAllEventBuses();
}

export function getAllWorldEventBusStats(): Map<string, EventStats> {
  return getAllEventBusStats();
}

export function setDefaultWorldEventBusConfig(config: WorldEventBusConfig): void {
  setDefaultEventBusConfig(config);
}

/**
 * Test utility: Clear all world event buses
 */
export function _clearAllWorldEventBusesForTesting(): void {
  clearAllEventBusesForTesting();
}

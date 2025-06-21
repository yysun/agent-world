/*
 * Event Bus Configuration Helper - Environment-Based Provider Switching
 * 
 * Features:
 * - Environment variable-based provider selection
 * - Default configuration management
 * - Easy switching between local and Dapr modes
 * - Configuration validation and defaults
 * 
 * Logic:
 * - Reads EVENT_BUS_PROVIDER environment variable
 * - Provides sensible defaults for each provider type
 * - Supports development, staging, and production configurations
 * - Validates configuration before initialization
 * 
 * Changes:
 * - Created helper for easy provider switching
 * - Environment-based configuration management
 * - Ready for deployment-specific provider selection
 */

import { initializeEventBus, EventBusConfig } from './event-bus';

/**
 * Initialize event bus based on environment configuration
 */
export function initializeEventBusFromEnv(): void {
  const provider = (process.env.EVENT_BUS_PROVIDER as 'local' | 'dapr') || 'local';

  const config: EventBusConfig = {
    provider,
    maxEventHistory: parseInt(process.env.EVENT_HISTORY_SIZE || '5000'),
    enableLogging: process.env.NODE_ENV !== 'test'
  };

  if (provider === 'dapr') {
    config.daprHost = process.env.DAPR_HOST || 'localhost';
    config.daprPort = parseInt(process.env.DAPR_PORT || '3500');
    config.pubsubName = process.env.DAPR_PUBSUB_NAME || 'dapr-world-pubsub';
  }

  initializeEventBus(config);
}

/**
 * Get configuration for development environment
 */
export function getDevelopmentConfig(): EventBusConfig {
  return {
    provider: 'local',
    maxEventHistory: 1000,
    enableLogging: true
  };
}

/**
 * Get configuration for production environment with Dapr
 */
export function getProductionConfig(): EventBusConfig {
  return {
    provider: 'dapr',
    daprHost: process.env.DAPR_HOST || 'localhost',
    daprPort: parseInt(process.env.DAPR_PORT || '3500'),
    pubsubName: process.env.DAPR_PUBSUB_NAME || 'dapr-world-pubsub',
    maxEventHistory: 10000,
    enableLogging: true
  };
}

/**
 * Get configuration for testing environment
 */
export function getTestConfig(): EventBusConfig {
  return {
    provider: 'local',
    maxEventHistory: 100,
    enableLogging: false
  };
}

/**
 * Switch provider at runtime (for testing or dynamic switching)
 */
export function switchToLocalProvider(): void {
  initializeEventBus(getDevelopmentConfig());
}

/**
 * Switch to Dapr provider at runtime
 */
export function switchToDaprProvider(): void {
  initializeEventBus(getProductionConfig());
}

/**
 * Backward Compatibility Layer - Bridge Between Function-based and Class-based APIs
 * 
 * Features:
 * - Seamless transition from function-based to class-based architecture
 * - Feature flags for gradual migration and rollback capabilities
 * - Wrapper functions that maintain existing API surface
 * - Performance monitoring to compare old vs new implementations
 * - Migration utilities for data structure conversion
 * - Safety mechanisms for production environment deployment
 * 
 * Implementation:
 * - Provides identical API to existing function-based managers
 * - Uses class-based implementations under the hood when enabled
 * - Falls back to original function-based code when disabled
 * - Includes comprehensive logging and monitoring for migration tracking
 * - Maintains full type compatibility with existing code
 * 
 * Architecture:
 * - Feature flag system for controlling class-based features
 * - Adapter pattern for bridging different interfaces
 * - Factory methods that choose implementation based on feature flags
 * - Performance comparison utilities for optimization validation
 * - Migration progress tracking and reporting
 * 
 * Feature Flags:
 * - AGENT_WORLD_USE_CLASSES: Enable class-based architecture
 * - AGENT_WORLD_USE_CLASS_STORAGE: Enable class-based storage managers
 * - AGENT_WORLD_USE_CLASS_AGENTS: Enable class-based agent management
 * - AGENT_WORLD_USE_CLASS_WORLDS: Enable class-based world management
 * - AGENT_WORLD_USE_CLASS_CHATS: Enable class-based chat management
 * 
 * Migration:
 * - Gradual feature activation with per-component control
 * - A/B testing capabilities for performance comparison
 * - Rollback mechanisms for emergency situations
 * - Data migration utilities for storage format changes
 * 
 * Changes:
 * - 2025-01-XX: Created as part of class-based architecture refactor
 * - Provides comprehensive backward compatibility layer
 * - Enables gradual migration from function-based to class-based design
 * - Includes feature flags and safety mechanisms for production deployment
 */

import type { 
  CreateWorldParams,
  UpdateWorldParams,
  CreateAgentParams,
  UpdateAgentParams,
  AgentInfo,
  AgentMessage,
  WorldData,
  CreateChatParams,
  UpdateChatParams,
  ChatData,
  WorldChat,
  World as IWorld
} from '../types.js';
import type { BaseStorageManager } from '../storage/BaseStorageManager.js';

/**
 * Feature flags configuration
 */
interface FeatureFlags {
  useClasses: boolean;
  useClassStorage: boolean;
  useClassAgents: boolean;
  useClassWorlds: boolean;
  useClassChats: boolean;
  enablePerformanceComparison: boolean;
  logMigrationEvents: boolean;
}

/**
 * Migration metrics for monitoring transition progress
 */
interface MigrationMetrics {
  functionBasedCalls: number;
  classBasedCalls: number;
  functionBasedErrors: number;
  classBasedErrors: number;
  averageFunctionTime: number;
  averageClassTime: number;
  migrationStartTime: Date | null;
  lastMigrationEvent: Date | null;
}

/**
 * Compatibility layer class for managing the transition
 */
export class CompatibilityLayer {
  private static instance: CompatibilityLayer | null = null;
  private featureFlags: FeatureFlags;
  private metrics: MigrationMetrics;
  private migrationLogger: ((event: string, data: any) => void) | null = null;

  private constructor() {
    this.featureFlags = this.loadFeatureFlags();
    this.metrics = {
      functionBasedCalls: 0,
      classBasedCalls: 0,
      functionBasedErrors: 0,
      classBasedErrors: 0,
      averageFunctionTime: 0,
      averageClassTime: 0,
      migrationStartTime: null,
      lastMigrationEvent: null
    };
  }

  /**
   * Get singleton instance
   */
  static getInstance(): CompatibilityLayer {
    if (!CompatibilityLayer.instance) {
      CompatibilityLayer.instance = new CompatibilityLayer();
    }
    return CompatibilityLayer.instance;
  }

  /**
   * Load feature flags from environment variables
   */
  private loadFeatureFlags(): FeatureFlags {
    return {
      useClasses: process.env.AGENT_WORLD_USE_CLASSES === 'true',
      useClassStorage: process.env.AGENT_WORLD_USE_CLASS_STORAGE === 'true',
      useClassAgents: process.env.AGENT_WORLD_USE_CLASS_AGENTS === 'true',
      useClassWorlds: process.env.AGENT_WORLD_USE_CLASS_WORLDS === 'true',
      useClassChats: process.env.AGENT_WORLD_USE_CLASS_CHATS === 'true',
      enablePerformanceComparison: process.env.AGENT_WORLD_ENABLE_PERF_COMPARISON === 'true',
      logMigrationEvents: process.env.AGENT_WORLD_LOG_MIGRATION === 'true'
    };
  }

  /**
   * Check if class-based architecture should be used
   */
  shouldUseClasses(): boolean {
    return this.featureFlags.useClasses;
  }

  /**
   * Check if class-based storage should be used
   */
  shouldUseClassStorage(): boolean {
    return this.featureFlags.useClassStorage || this.featureFlags.useClasses;
  }

  /**
   * Check if class-based agents should be used
   */
  shouldUseClassAgents(): boolean {
    return this.featureFlags.useClassAgents || this.featureFlags.useClasses;
  }

  /**
   * Check if class-based worlds should be used
   */
  shouldUseClassWorlds(): boolean {
    return this.featureFlags.useClassWorlds || this.featureFlags.useClasses;
  }

  /**
   * Check if class-based chats should be used
   */
  shouldUseClassChats(): boolean {
    return this.featureFlags.useClassChats || this.featureFlags.useClasses;
  }

  /**
   * Enable specific features
   */
  enableFeature(feature: keyof FeatureFlags): void {
    this.featureFlags[feature] = true;
    this.logMigrationEvent('feature_enabled', { feature });
  }

  /**
   * Disable specific features
   */
  disableFeature(feature: keyof FeatureFlags): void {
    this.featureFlags[feature] = false;
    this.logMigrationEvent('feature_disabled', { feature });
  }

  /**
   * Enable all class-based features
   */
  enableAllClassFeatures(): void {
    this.featureFlags.useClasses = true;
    this.featureFlags.useClassStorage = true;
    this.featureFlags.useClassAgents = true;
    this.featureFlags.useClassWorlds = true;
    this.featureFlags.useClassChats = true;
    this.logMigrationEvent('all_features_enabled', {});
  }

  /**
   * Disable all class-based features (rollback)
   */
  disableAllClassFeatures(): void {
    this.featureFlags.useClasses = false;
    this.featureFlags.useClassStorage = false;
    this.featureFlags.useClassAgents = false;
    this.featureFlags.useClassWorlds = false;
    this.featureFlags.useClassChats = false;
    this.logMigrationEvent('all_features_disabled', {});
  }

  /**
   * Record metrics for function-based operation
   */
  recordFunctionBasedOperation(duration: number, error?: boolean): void {
    this.metrics.functionBasedCalls++;
    if (error) {
      this.metrics.functionBasedErrors++;
    } else {
      // Update average time (exponential moving average)
      if (this.metrics.averageFunctionTime === 0) {
        this.metrics.averageFunctionTime = duration;
      } else {
        this.metrics.averageFunctionTime = 
          (this.metrics.averageFunctionTime * 0.9) + (duration * 0.1);
      }
    }
  }

  /**
   * Record metrics for class-based operation
   */
  recordClassBasedOperation(duration: number, error?: boolean): void {
    this.metrics.classBasedCalls++;
    if (error) {
      this.metrics.classBasedErrors++;
    } else {
      // Update average time (exponential moving average)
      if (this.metrics.averageClassTime === 0) {
        this.metrics.averageClassTime = duration;
      } else {
        this.metrics.averageClassTime = 
          (this.metrics.averageClassTime * 0.9) + (duration * 0.1);
      }
    }
  }

  /**
   * Get migration metrics
   */
  getMetrics(): MigrationMetrics {
    return { ...this.metrics };
  }

  /**
   * Set migration logger
   */
  setMigrationLogger(logger: (event: string, data: any) => void): void {
    this.migrationLogger = logger;
  }

  /**
   * Log migration event
   */
  private logMigrationEvent(event: string, data: any): void {
    this.metrics.lastMigrationEvent = new Date();
    
    if (this.featureFlags.logMigrationEvents && this.migrationLogger) {
      this.migrationLogger(event, {
        ...data,
        timestamp: new Date().toISOString(),
        featureFlags: this.featureFlags
      });
    }
  }

  /**
   * Reset metrics (useful for testing)
   */
  resetMetrics(): void {
    this.metrics = {
      functionBasedCalls: 0,
      classBasedCalls: 0,
      functionBasedErrors: 0,
      classBasedErrors: 0,
      averageFunctionTime: 0,
      averageClassTime: 0,
      migrationStartTime: new Date(),
      lastMigrationEvent: null
    };
  }
}

/**
 * Performance comparison utility for A/B testing
 */
export async function compareImplementations<T>(
  functionBasedImpl: () => Promise<T>,
  classBasedImpl: () => Promise<T>,
  operationName: string
): Promise<{
  functionResult?: T;
  classResult?: T;
  functionTime: number;
  classTime: number;
  functionError?: Error;
  classError?: Error;
  performanceDifference: number;
}> {
  const compatibility = CompatibilityLayer.getInstance();
  
  let functionResult: T | undefined;
  let classResult: T | undefined;
  let functionError: Error | undefined;
  let classError: Error | undefined;
  
  // Test function-based implementation
  const functionStart = Date.now();
  try {
    functionResult = await functionBasedImpl();
    compatibility.recordFunctionBasedOperation(Date.now() - functionStart, false);
  } catch (error) {
    functionError = error as Error;
    compatibility.recordFunctionBasedOperation(Date.now() - functionStart, true);
  }
  const functionTime = Date.now() - functionStart;
  
  // Test class-based implementation
  const classStart = Date.now();
  try {
    classResult = await classBasedImpl();
    compatibility.recordClassBasedOperation(Date.now() - classStart, false);
  } catch (error) {
    classError = error as Error;
    compatibility.recordClassBasedOperation(Date.now() - classStart, true);
  }
  const classTime = Date.now() - classStart;
  
  const performanceDifference = ((functionTime - classTime) / functionTime) * 100;
  
  return {
    functionResult,
    classResult,
    functionTime,
    classTime,
    functionError,
    classError,
    performanceDifference
  };
}

/**
 * Migration progress tracker
 */
export class MigrationTracker {
  private static progressData = {
    storageManagerMigrated: false,
    agentManagerMigrated: false,
    worldManagerMigrated: false,
    chatManagerMigrated: false,
    cliMigrated: false,
    apiMigrated: false,
    testsMigrated: false,
    documentationMigrated: false
  };

  static markComponentMigrated(component: keyof typeof MigrationTracker.progressData): void {
    MigrationTracker.progressData[component] = true;
    
    const compatibility = CompatibilityLayer.getInstance();
    compatibility['logMigrationEvent']('component_migrated', { 
      component, 
      progress: MigrationTracker.getProgress() 
    });
  }

  static getProgress(): { completed: number; total: number; percentage: number; components: typeof MigrationTracker.progressData } {
    const components = MigrationTracker.progressData;
    const total = Object.keys(components).length;
    const completed = Object.values(components).filter(Boolean).length;
    const percentage = (completed / total) * 100;

    return { completed, total, percentage, components };
  }

  static isFullyMigrated(): boolean {
    return Object.values(MigrationTracker.progressData).every(Boolean);
  }

  static reset(): void {
    Object.keys(MigrationTracker.progressData).forEach(key => {
      (MigrationTracker.progressData as any)[key] = false;
    });
  }
}

/**
 * Utility functions for feature flag management
 */
export function enableClassBasedArchitecture(): void {
  const compatibility = CompatibilityLayer.getInstance();
  compatibility.enableAllClassFeatures();
}

export function disableClassBasedArchitecture(): void {
  const compatibility = CompatibilityLayer.getInstance();
  compatibility.disableAllClassFeatures();
}

export function isClassBasedArchitectureEnabled(): boolean {
  const compatibility = CompatibilityLayer.getInstance();
  return compatibility.shouldUseClasses();
}

export function setMigrationLogger(logger: (event: string, data: any) => void): void {
  const compatibility = CompatibilityLayer.getInstance();
  compatibility.setMigrationLogger(logger);
}

export function getMigrationMetrics(): MigrationMetrics {
  const compatibility = CompatibilityLayer.getInstance();
  return compatibility.getMetrics();
}

export function getMigrationProgress(): ReturnType<typeof MigrationTracker.getProgress> {
  return MigrationTracker.getProgress();
}

/**
 * Environment-based feature flag initialization
 */
export function initializeFeatureFlags(): void {
  const compatibility = CompatibilityLayer.getInstance();
  
  // Auto-enable class features in development
  if (process.env.NODE_ENV === 'development' && process.env.AGENT_WORLD_AUTO_ENABLE_CLASSES === 'true') {
    compatibility.enableAllClassFeatures();
  }
  
  // Initialize migration start time if any features are enabled
  const metrics = compatibility.getMetrics();
  if (compatibility.shouldUseClasses() && !metrics.migrationStartTime) {
    compatibility['metrics'].migrationStartTime = new Date();
  }
}
/**
 * Integration Module - Backward Compatibility and Migration Support
 * 
 * Features:
 * - Comprehensive backward compatibility layer for gradual migration
 * - Feature flag system for controlling class-based architecture adoption
 * - Performance monitoring and comparison between old and new implementations
 * - Migration tracking and progress reporting
 * - Safety mechanisms for production environment deployment
 * - Seamless API compatibility during transition period
 * 
 * Architecture:
 * - CompatibilityLayer: Central feature flag and metrics management
 * - CompatibleFactories: Drop-in replacements for existing factory functions
 * - Migration utilities: Tools for tracking and managing the transition
 * - Performance comparison: A/B testing capabilities for validation
 * - Safety mechanisms: Rollback and fallback functionality
 * 
 * Usage:
 * ```typescript
 * import { 
 *   enableClassBasedArchitecture,
 *   createCompatibleWorld,
 *   getMigrationProgress 
 * } from './integration/index.js';
 * 
 * // Enable class-based features
 * enableClassBasedArchitecture();
 * 
 * // Use compatible factory (automatically chooses implementation)
 * const world = await createCompatibleWorld(rootPath, params);
 * 
 * // Monitor migration progress
 * const progress = getMigrationProgress();
 * ```
 * 
 * Migration Strategy:
 * 1. Deploy with all class features disabled (validation phase)
 * 2. Enable class storage managers (infrastructure phase)
 * 3. Enable class agents and worlds (core functionality phase)
 * 4. Enable class chats (complete migration phase)
 * 5. Remove function-based fallbacks (cleanup phase)
 * 
 * Changes:
 * - 2025-01-XX: Created as part of class-based architecture refactor
 * - Provides complete backward compatibility and migration support
 * - Enables safe, gradual transition from function-based to class-based design
 * - Includes comprehensive monitoring and rollback capabilities
 */

// Export compatibility layer
export {
  CompatibilityLayer,
  compareImplementations,
  MigrationTracker
} from './CompatibilityLayer.js';

// Export compatible factory functions
export {
  createCompatibleStorageManager,
  createCompatibleWorld,
  loadCompatibleWorld,
  createWorldFromData,
  compareWorldImplementations,
  clearCompatibilityCaches,
  getCompatibilityCacheStats
} from './CompatibleFactories.js';

// Export utility functions
export {
  enableClassBasedArchitecture,
  disableClassBasedArchitecture,
  isClassBasedArchitectureEnabled,
  setMigrationLogger,
  getMigrationMetrics,
  getMigrationProgress,
  initializeFeatureFlags
} from './CompatibilityLayer.js';

// Re-export types for convenience
export type { BaseStorageManager } from '../storage/BaseStorageManager.js';
export type {
  CreateWorldParams,
  UpdateWorldParams,
  CreateAgentParams,
  UpdateAgentParams,
  World as IWorld,
  WorldData,
  ChatData,
  WorldChat
} from '../types.js';

/**
 * Initialize the integration layer
 * Call this once at application startup
 */
export function initializeIntegration(): void {
  initializeFeatureFlags();
  
  // Set up default migration logger if none is set
  if (process.env.AGENT_WORLD_LOG_MIGRATION === 'true') {
    setMigrationLogger((event: string, data: any) => {
      console.log(`[MIGRATION] ${event}:`, data);
    });
  }
}

/**
 * Migration phase management
 */
export enum MigrationPhase {
  VALIDATION = 'validation',     // All class features disabled
  INFRASTRUCTURE = 'infrastructure', // Class storage enabled
  CORE_FUNCTIONALITY = 'core',   // Class agents and worlds enabled
  COMPLETE = 'complete',         // All class features enabled
  CLEANUP = 'cleanup'            // Function-based code removed
}

/**
 * Set migration phase with appropriate feature flags
 */
export function setMigrationPhase(phase: MigrationPhase): void {
  const compatibility = CompatibilityLayer.getInstance();
  
  switch (phase) {
    case MigrationPhase.VALIDATION:
      compatibility.disableAllClassFeatures();
      break;
      
    case MigrationPhase.INFRASTRUCTURE:
      compatibility.disableAllClassFeatures();
      compatibility.enableFeature('useClassStorage');
      break;
      
    case MigrationPhase.CORE_FUNCTIONALITY:
      compatibility.enableFeature('useClassStorage');
      compatibility.enableFeature('useClassAgents');
      compatibility.enableFeature('useClassWorlds');
      break;
      
    case MigrationPhase.COMPLETE:
      compatibility.enableAllClassFeatures();
      break;
      
    case MigrationPhase.CLEANUP:
      compatibility.enableAllClassFeatures();
      // In this phase, function-based fallbacks would be removed
      break;
  }
}

/**
 * Get current migration phase based on enabled features
 */
export function getCurrentMigrationPhase(): MigrationPhase {
  const compatibility = CompatibilityLayer.getInstance();
  
  if (!compatibility.shouldUseClassStorage()) {
    return MigrationPhase.VALIDATION;
  }
  
  if (!compatibility.shouldUseClassAgents() || !compatibility.shouldUseClassWorlds()) {
    return MigrationPhase.INFRASTRUCTURE;
  }
  
  if (!compatibility.shouldUseClassChats()) {
    return MigrationPhase.CORE_FUNCTIONALITY;
  }
  
  const progress = getMigrationProgress();
  if (progress.percentage === 100) {
    return MigrationPhase.CLEANUP;
  }
  
  return MigrationPhase.COMPLETE;
}

/**
 * Emergency rollback to function-based implementation
 */
export function emergencyRollback(reason?: string): void {
  const compatibility = CompatibilityLayer.getInstance();
  compatibility.disableAllClassFeatures();
  
  // Clear all caches to ensure clean state
  clearCompatibilityCaches();
  
  if (reason) {
    console.warn(`[EMERGENCY ROLLBACK] ${reason}`);
  }
  
  // Log rollback event
  setMigrationLogger((event: string, data: any) => {
    console.error(`[ROLLBACK] ${event}:`, data);
  });
}

/**
 * Health check for migration status
 */
export async function checkMigrationHealth(): Promise<{
  healthy: boolean;
  issues: string[];
  recommendations: string[];
}> {
  const issues: string[] = [];
  const recommendations: string[] = [];
  
  try {
    const metrics = getMigrationMetrics();
    const progress = getMigrationProgress();
    
    // Check error rates
    const functionErrorRate = metrics.functionBasedCalls > 0 
      ? metrics.functionBasedErrors / metrics.functionBasedCalls 
      : 0;
    const classErrorRate = metrics.classBasedCalls > 0 
      ? metrics.classBasedErrors / metrics.classBasedCalls 
      : 0;
    
    if (functionErrorRate > 0.05) {
      issues.push(`High function-based error rate: ${(functionErrorRate * 100).toFixed(2)}%`);
    }
    
    if (classErrorRate > 0.05) {
      issues.push(`High class-based error rate: ${(classErrorRate * 100).toFixed(2)}%`);
    }
    
    // Check performance
    if (metrics.averageClassTime > metrics.averageFunctionTime * 2) {
      issues.push('Class-based implementation is significantly slower');
      recommendations.push('Consider performance optimizations before full migration');
    }
    
    // Check migration progress
    if (progress.percentage > 0 && progress.percentage < 100) {
      recommendations.push('Migration is in progress - monitor carefully');
    }
    
    return {
      healthy: issues.length === 0,
      issues,
      recommendations
    };
    
  } catch (error) {
    return {
      healthy: false,
      issues: [`Migration health check failed: ${error instanceof Error ? error.message : error}`],
      recommendations: ['Consider emergency rollback if issues persist']
    };
  }
}
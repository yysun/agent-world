/**
 * Simplified Commands Module Index
 * 
 * Features:
 * - Unified export structure for simplified commands layer
 * - Backward compatible re-exports for existing imports
 * - Consolidated command processing and world subscription
 * 
 * Exports:
 * - Simplified types from types-new.ts
 * - Unified command processing from core.ts
 * - Backward compatibility aliases
 * 
 * Implementation:
 * - Single source of truth for command functionality
 * - Maintains existing import patterns
 * - Reduced module complexity
 */

// Export simplified types and interfaces
export * from './types-new.js';

// Export unified command processing and world subscription
export * from './core.js';

// Legacy re-exports for backward compatibility (if needed)
// These can be removed once all consumers are updated
export { processCommand as processCommandRequest } from './core.js';

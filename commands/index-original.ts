/**
 * Commands Module Index
 * 
 * Features:
 * - Central export for all command-related functionality
 * - Re-exports types, command implementations, and event handling
 * - Provides unified interface for command system components
 * 
 * Exports:
 * - Command types and interfaces from types.ts
 * - Command implementations and registry from commands.ts
 * - Event handling functions and schemas from events.ts
 * 
 * Implementation:
 * - Simple re-export pattern for module organization
 * - Maintains backward compatibility for existing imports
 */

// Export all types and interfaces
export * from './types.js';

// Export command implementations and registry
export * from './commands.js';

// Export event handling functions and schemas
export * from './events.js';

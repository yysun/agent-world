/**
 * Commands Module - Simplified Subscription-Only Export
 * 
 * This module now only exports world subscription management functionality.
 * Command processing has been eliminated in favor of direct core function calls.
 * 
 * Exports:
 * - World subscription management (subscription.ts)
 * - Client connection interface
 * - Event handling utilities
 * 
 * Removed:
 * - Redundant command processing wrapper
 * - Command request/response types 
 * - Command routing logic
 */

// Export only subscription management functionality
export * from './subscription.js';

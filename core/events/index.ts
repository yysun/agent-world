/**
 * Events Module - Public API
 * 
 * This module provides event publishing, subscription, and agent orchestration functions.
 * All functions are now extracted into modular structure for better maintainability.
 * 
 * Modular structure:
 * - publishers.ts: Event emission functions (Layer 3)
 * - mention-logic.ts: Auto-mention processing (Layer 2)
 * - persistence.ts: Event persistence (Layer 4)
 * - memory-manager.ts: Memory & LLM resumption (Layer 4)
 * - orchestrator.ts: Agent message processing (Layer 5)
 * - subscribers.ts: Event subscriptions (Layer 6)
 * 
 * Changes:
 * - 2026-02-08: Removed outdated manual tool-intervention checker module reference
 * - 2025-11-09: Completed extraction of all layers (2-6) from monolithic events.ts
 */

// Layer 2: Pure utilities (no dependencies)
export * from './mention-logic.js';

// Layer 3: Event publishers
export * from './publishers.js';

// Layer 4: Persistence & Memory
export * from './persistence.js';
export * from './memory-manager.js';

// Layer 5: Orchestration
export * from './orchestrator.js';

// Layer 6: Subscriptions
export * from './subscribers.js';

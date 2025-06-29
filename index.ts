/**
 * Agent World - Main Package Entry Point
 *
 * Features:
 * - World-centric agent management system
 * - LLM provider abstraction layer
 * - Event-driven architecture
 * - TypeScript-native execution
 * - Command-line and server interfaces
 *
 * This module re-exports the core functionality of Agent World for npm package usage.
 */

// Re-export all core functionality
export * from './core/index';

// Package information
export const PACKAGE_INFO = {
  name: 'agent-world',
  version: '2.0.0',
  description: 'A TypeScript-native agent management system with world-centric access patterns'
} as const;

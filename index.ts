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
  version: '0.3.0',
  description: 'A agent management system for building AI agent teams with just words.',
} as const;

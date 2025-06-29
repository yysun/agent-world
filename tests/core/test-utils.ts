/**
 * Core Test Utilities
 * 
 * Provides helper functions for testing core modules:
 * - Test world creation and cleanup
 * - Test agent creation with mock data
 * - Test environment setup and teardown
 * - Mock data generation for consistent testing
 */

import { createWorld, deleteWorld } from '../../core/world-manager';
import { CreateWorldParams, CreateAgentParams, LLMProvider } from '../../core/types';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Test environment configuration
 */
export const TEST_CONFIG = {
  rootPath: join(tmpdir(), 'agent-world-tests'),
  defaultWorld: 'test-world',
  defaultAgent: 'test-agent'
};

/**
 * Create a test world with default configuration
 */
export async function createTestWorld(params?: Partial<CreateWorldParams>) {
  const worldParams: CreateWorldParams = {
    name: 'Test World',
    description: 'Test world for unit testing',
    turnLimit: 5,
    ...params
  };

  return await createWorld(TEST_CONFIG.rootPath, worldParams);
}

/**
 * Create test agent parameters
 */
export function createTestAgentParams(params?: Partial<CreateAgentParams>): CreateAgentParams {
  return {
    id: 'test-agent',
    name: 'Test Agent',
    type: 'assistant',
    provider: LLMProvider.OPENAI,
    model: 'gpt-4o',
    systemPrompt: 'You are a test agent for unit testing',
    ...params
  };
}

/**
 * Clean up test world
 */
export async function cleanupTestWorld(worldId: string) {
  try {
    await deleteWorld(TEST_CONFIG.rootPath, worldId);
  } catch (error) {
    // Ignore cleanup errors in tests
    console.warn(`Test cleanup warning: ${error}`);
  }
}

/**
 * Generate unique test world name
 */
export function generateTestWorldName(): string {
  return `test-world-${randomUUID().slice(0, 8)}`;
}

/**
 * Generate unique test agent name
 */
export function generateTestAgentName(): string {
  return `test-agent-${randomUUID().slice(0, 8)}`;
}

/**
 * Setup test environment
 */
export async function setupTestEnvironment() {
  // Create test directory if it doesn't exist
  const { mkdir } = await import('fs/promises');
  try {
    await mkdir(TEST_CONFIG.rootPath, { recursive: true });
  } catch (error) {
    // Directory may already exist
  }
}

/**
 * Teardown test environment
 */
export async function teardownTestEnvironment() {
  const { rm } = await import('fs/promises');
  try {
    await rm(TEST_CONFIG.rootPath, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
    console.warn(`Test teardown warning: ${error}`);
  }
}

/**
 * Test Helpers for Core System Testing
 * 
 * Features:
 * - Test world and agent creation utilities
 * - Mock data generation for consistent testing
 * - Cleanup utilities for test isolation
 * - Helper functions for world-agent relationship testing
 * 
 * Implementation:
 * - Creates temporary test data directories
 * - Provides consistent test agent and world configurations
 * - Handles cleanup to prevent test interference
 * - Utilities for validating world-agent relationships
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { Agent, World, AgentMessage, LLMProvider } from '../../core/types.js';
import { CreateWorldParams } from '../../core/world-manager.js';
import { CreateAgentParams } from '../../core/agent-manager.js';
import { toKebabCase } from '../../core/utils.js';
import { getAgentDir } from '../../core/agent-storage.js';

/**
 * Test configuration
 */
export const TEST_CONFIG = {
  testDataPath: './test-data/core-tests',
  defaultWorldName: 'test-world',
  defaultAgentName: 'test-agent'
};

/**
 * Setup test environment before tests
 */
export async function setupTestEnvironment(): Promise<string> {
  // Set environment variable for core system to use test data path
  process.env.AGENT_WORLD_DATA_PATH = TEST_CONFIG.testDataPath;

  // Ensure test data directory exists
  await fs.mkdir(TEST_CONFIG.testDataPath, { recursive: true });

  return TEST_CONFIG.testDataPath;
}

/**
 * Cleanup test environment after tests
 */
export async function cleanupTestEnvironment(testDataPath?: string): Promise<void> {
  try {
    const pathToClean = testDataPath || TEST_CONFIG.testDataPath;
    await fs.rm(pathToClean, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }

  // Remove environment variable
  delete process.env.AGENT_WORLD_DATA_PATH;
}

/**
 * Create test world configuration
 */
export function createTestWorldConfig(nameOrOverrides?: string | Partial<CreateWorldParams>, overrides?: Partial<CreateWorldParams>): CreateWorldParams {
  if (typeof nameOrOverrides === 'string') {
    return {
      name: nameOrOverrides,
      description: 'Test world for unit testing',
      turnLimit: 5,
      ...overrides
    };
  }

  return {
    name: TEST_CONFIG.defaultWorldName,
    description: 'Test world for unit testing',
    turnLimit: 5,
    ...nameOrOverrides
  };
}

/**
 * Create test agent configuration that returns CreateAgentParams
 * Supports both (id: string) and ({ id, name, ... }) calling patterns
 */
export function createTestAgentConfig(
  idOrConfig?: string | Partial<CreateAgentParams>,
  overrides: Partial<CreateAgentParams> = {}
): CreateAgentParams {
  let id: string;
  let config: Partial<CreateAgentParams>;

  if (typeof idOrConfig === 'string') {
    // Called with string ID: createTestAgentConfig('agent-1', { ... })
    id = idOrConfig || TEST_CONFIG.defaultAgentName;
    config = overrides;
  } else if (typeof idOrConfig === 'object' && idOrConfig !== null) {
    // Called with config object: createTestAgentConfig({ id: 'agent-1', name: '...' })
    id = idOrConfig.id || TEST_CONFIG.defaultAgentName;
    config = idOrConfig;
  } else {
    // Called with no arguments: createTestAgentConfig()
    id = TEST_CONFIG.defaultAgentName;
    config = {};
  }

  return {
    id,
    name: `Test Agent ${id}`,
    type: 'test',
    provider: LLMProvider.OPENAI,
    model: 'gpt-4',
    systemPrompt: `You are ${id}, a test AI agent.`,
    temperature: 0.7,
    maxTokens: 1000,
    ...config
  };
}

/**
 * Create test agent as full Agent object
 */
export function createTestAgent(agentId?: string, overrides: Partial<Agent> = {}): Agent {
  const id = agentId || TEST_CONFIG.defaultAgentName;
  const now = new Date();

  return {
    id,
    type: 'test',
    status: 'inactive',
    config: {
      name: `Test Agent ${id}`,
      type: 'test',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: `You are ${id}, a test AI agent.`,
      temperature: 0.7,
      maxTokens: 1000,
      autoSyncMemory: true
    },
    createdAt: now,
    lastActive: now,
    llmCallCount: 0,
    memory: [],
    ...overrides
  };
}

/**
 * Create multiple test agent configurations
 */
export function createMultipleTestAgentConfigs(count: number): CreateAgentParams[] {
  const agents: CreateAgentParams[] = [];

  for (let i = 0; i < count; i++) {
    agents.push(createTestAgentConfig(`test-agent-${i}`, {
      name: `Test Agent ${i}`,
      systemPrompt: `You are test agent ${i} for unit testing.`
    }));
  }

  return agents;
}

/**
 * Verify world directory structure exists
 */
export async function verifyWorldDirectoryStructure(worldName: string): Promise<boolean> {
  try {
    const worldDir = path.join(TEST_CONFIG.testDataPath, worldName);
    const agentsDir = path.join(worldDir, 'agents');
    const configPath = path.join(worldDir, 'config.json');

    await fs.access(worldDir);
    await fs.access(agentsDir);
    await fs.access(configPath);

    return true;
  } catch {
    return false;
  }
}

/**
 * Verify agent directory structure exists
 */
export async function verifyAgentDirectoryStructure(worldName: string, agentId: string): Promise<boolean> {
  try {
    const agentDir = path.join(TEST_CONFIG.testDataPath, worldName, 'agents', agentId);
    const configPath = path.join(agentDir, 'config.json');
    const systemPromptPath = path.join(agentDir, 'system-prompt.md');
    const memoryPath = path.join(agentDir, 'memory.json');

    await fs.access(agentDir);
    await fs.access(configPath);
    await fs.access(systemPromptPath);
    await fs.access(memoryPath);

    return true;
  } catch {
    return false;
  }
}

/**
 * Count agents in world directory
 */
export async function countAgentsInWorld(worldName: string): Promise<number> {
  try {
    const agentsDir = path.join(TEST_CONFIG.testDataPath, worldName, 'agents');
    const entries = await fs.readdir(agentsDir, { withFileTypes: true });
    return entries.filter(entry => entry.isDirectory()).length;
  } catch {
    return 0;
  }
}

/**
 * Validate world-agent relationship consistency
 */
export async function validateWorldAgentRelationship(world: World): Promise<{
  isValid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  // Check if world has EventEmitter
  if (!world.eventEmitter) {
    errors.push('World missing EventEmitter');
  }

  // Check if agents Map exists
  if (!world.agents) {
    errors.push('World missing agents Map');
  }

  // Validate each agent in the Map
  if (world.agents) {
    for (const [agentId, agent] of world.agents) {
      // Check ID consistency
      if (agent.id !== agentId) {
        errors.push(`Agent ID mismatch: Map key ${agentId} vs agent.id ${agent.id}`);
      }

      // Check required fields
      if (!agent.config) {
        errors.push(`Agent ${agentId} missing config`);
      }

      if (!agent.memory) {
        errors.push(`Agent ${agentId} missing memory`);
      }

      // Check Date objects
      if (!agent.createdAt || !(agent.createdAt instanceof Date)) {
        errors.push(`Agent ${agentId} missing or invalid createdAt`);
      }

      if (!agent.lastActive || !(agent.lastActive instanceof Date)) {
        errors.push(`Agent ${agentId} missing or invalid lastActive`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Create corrupted agent files for error testing
 */
export async function createCorruptedAgentFiles(worldName: string, agentId: string): Promise<void> {
  const agentDir = path.join(TEST_CONFIG.testDataPath, worldName, 'agents', agentId);
  await fs.mkdir(agentDir, { recursive: true });

  // Create invalid JSON config
  await fs.writeFile(path.join(agentDir, 'config.json'), '{ invalid json }', 'utf8');

  // Create empty system prompt
  await fs.writeFile(path.join(agentDir, 'system-prompt.md'), '', 'utf8');

  // Create invalid memory file
  await fs.writeFile(path.join(agentDir, 'memory.json'), '{ "messages": "invalid" }', 'utf8');
}

/**
 * Alias for createCorruptedAgentFiles to match import expectations
 */
export const createCorruptedAgentData = createCorruptedAgentFiles;

/**
 * Create missing agent files for error testing
 */
export async function createPartialAgentFiles(worldName: string, agentId: string): Promise<void> {
  const agentDir = path.join(TEST_CONFIG.testDataPath, worldName, 'agents', agentId);
  await fs.mkdir(agentDir, { recursive: true });

  // Only create config file, missing system-prompt.md and memory.json
  const agentConfig = {
    id: agentId,
    type: 'test',
    status: 'active',
    config: {
      name: 'Partial Agent',
      type: 'test',
      provider: 'openai',
      model: 'gpt-4'
    },
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
    llmCallCount: 0
  };

  await fs.writeFile(
    path.join(agentDir, 'config.json'),
    JSON.stringify(agentConfig, null, 2),
    'utf8'
  );

  // Create system-prompt.md so the agent loads
  await fs.writeFile(
    path.join(agentDir, 'system-prompt.md'),
    'You are a partial agent for testing.',
    'utf8'
  );

  // Don't create memory.json to test fallback behavior
}

/**
 * Write test agent to disk with full structure  
 * Supports both Agent and CreateAgentParams by converting as needed
 */
export async function writeTestAgent(worldId: string, agentOrParams: Agent | CreateAgentParams): Promise<void> {
  let agent: Agent;

  // Convert CreateAgentParams to Agent if needed
  if ('config' in agentOrParams && agentOrParams.config && typeof agentOrParams.config === 'object') {
    // Already an Agent
    agent = agentOrParams as Agent;
  } else {
    // Convert CreateAgentParams to Agent
    const params = agentOrParams as CreateAgentParams;
    const now = new Date();
    agent = {
      id: params.id,
      type: params.type,
      status: 'inactive',
      config: {
        name: params.name,
        type: params.type,
        provider: params.provider,
        model: params.model,
        systemPrompt: params.systemPrompt,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
        apiKey: params.apiKey,
        baseUrl: params.baseUrl
      },
      createdAt: now,
      lastActive: now,
      llmCallCount: 0,
      memory: []
    };
  }

  const agentId = toKebabCase(agent.id);
  const agentDir = getAgentDir(worldId, agentId);
  await fs.mkdir(agentDir, { recursive: true });

  // Save system prompt
  const systemPromptPath = path.join(agentDir, 'system-prompt.md');
  const systemPromptContent = agent.config.systemPrompt || `You are ${agent.id}, an AI agent.`;
  await fs.writeFile(systemPromptPath, systemPromptContent, 'utf8');

  // Save memory
  const memoryPath = path.join(agentDir, 'memory.json');
  await fs.writeFile(memoryPath, JSON.stringify(agent.memory || [], null, 2), 'utf8');

  // Save config without system prompt
  const { systemPrompt, ...configWithoutPrompt } = agent.config;
  const agentData = {
    ...agent,
    config: configWithoutPrompt,
    createdAt: agent.createdAt?.toISOString(),
    lastActive: agent.lastActive?.toISOString(),
    lastLLMCall: agent.lastLLMCall?.toISOString()
  };

  const configPath = path.join(agentDir, 'config.json');
  await fs.writeFile(configPath, JSON.stringify(agentData, null, 2), 'utf8');
}

/**
 * Wait for async operations to complete
 */
export function waitFor(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

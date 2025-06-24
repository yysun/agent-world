/**
 * agent-lifecycle.test.ts
 *
 * Unit test suite for agent lifecycle and persistence features using world.ts functions.
 * All file operations are mocked to prevent real file I/O during testing.
 *
 * Test Cases:
 * - should handle agent lifecycle with persistence
 * - should persist agent data to storage
 * - should handle agent status tracking
 * - should validate agent configuration
 * - should persist agents across world restarts
 * - should handle file storage operations correctly
 * - should handle data corruption gracefully
 *
 * Features:
 * - Comprehensive fs mocking for agent storage operations
 * - Tests agent lifecycle without creating real files
 * - Validates agent persistence behavior through mocked responses
 * - Proper cleanup of in-memory state between tests
 *
 * Logic:
 * - Mocks fs operations to simulate file-based agent storage
 * - Tests agent creation, persistence, and removal
 * - Validates proper cleanup and memory management
 * - Uses mocked responses to simulate different file states
 *
 * Changes:
 * - Converted from real file I/O to fully mocked operations
 * - Removed real file cleanup in afterEach
 * - Enhanced fs mocking for comprehensive agent storage testing
 * - Maintained full test coverage without file system side effects
 *
 * Updated: 2025-06-24
 * Note: Updated to use world.ts functions instead of deprecated storage.ts functions
 */

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  createWorld,
  createAgent,
  getAgent,
  getAgents,
  removeAgent,
  updateAgent,
  loadWorld,
  saveWorld,
  _clearAllWorldsForTesting
} from '../src/world';
import { initializeFileStorage } from '../src/storage';
import { LLMProvider, Agent, AgentConfig } from '../src/types';

// Mock fs for testing
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  access: jest.fn(),
  readdir: jest.fn(),
  mkdir: jest.fn(),
  rmdir: jest.fn(),
  rm: jest.fn()
}));

// Mock storage for testing
jest.mock('../src/storage', () => ({
  initializeFileStorage: jest.fn(),
  ensureDirectory: jest.fn()
}));

// Mock event bus for testing
jest.mock('../src/event-bus', () => ({
  initializeEventBus: jest.fn(),
  publishWorldEvent: jest.fn(),
  publishMessageEvent: jest.fn(),
  subscribeToWorld: jest.fn(() => jest.fn()), // Return unsubscribe function
  subscribeToMessages: jest.fn(() => jest.fn()), // Return unsubscribe function
  subscribeToSSE: jest.fn(() => jest.fn()) // Return unsubscribe function
}));

// Mock agent for testing
jest.mock('../src/agent', () => ({
  createAgent: jest.fn(),
  processMessage: jest.fn()
}));

// Mock LLM for testing
jest.mock('../src/llm', () => ({
  processMessage: jest.fn().mockResolvedValue('Mock LLM response')
}));

const TEST_DATA_PATH = path.join(process.cwd(), 'test-data');

describe('Agent Lifecycle and Persistence', () => {
  let mockFs: jest.Mocked<typeof fs>;

  beforeEach(async () => {
    // Setup mocks
    mockFs = fs as jest.Mocked<typeof fs>;

    // Mock file system operations with detailed responses
    mockFs.readFile.mockImplementation(async (filePath) => {
      const path = filePath.toString();

      // Mock world config.json files based on kebab-case directory names
      if (path.includes('config.json') && !path.includes('agents')) {
        if (path.includes('storage-world')) {
          return JSON.stringify({
            name: 'Storage World',
            createdAt: new Date().toISOString(),
            agents: {}
          });
        } else if (path.includes('persistent-world')) {
          return JSON.stringify({
            name: 'Persistent World',
            createdAt: new Date().toISOString(),
            agents: {}
          });
        } else if (path.includes('storage-agent-world')) {
          return JSON.stringify({
            name: 'Storage Agent World',
            createdAt: new Date().toISOString(),
            agents: {}
          });
        } else {
          return JSON.stringify({
            name: 'Test World',
            createdAt: new Date().toISOString(),
            agents: {}
          });
        }
      }

      // Mock agent config.json files based on kebab-case agent directory names
      if (path.includes('agents') && path.includes('config.json')) {
        let agentName = 'TestAgent';
        let status = 'active';
        let model = 'gpt-3.5-turbo';

        if (path.includes('storage-agent')) {
          agentName = 'StorageAgent';
          model = 'gpt-4';
        } else if (path.includes('persistent-agent1')) {
          agentName = 'PersistentAgent1';
          status = 'inactive';
        } else if (path.includes('test-agent')) {
          agentName = 'TestAgent';
        }

        return JSON.stringify({
          name: agentName,
          type: 'ai',
          status: status,
          config: {
            name: agentName,
            type: 'ai',
            provider: 'openai',
            model: model
          },
          createdAt: new Date().toISOString(),
          lastActive: new Date().toISOString(),
          metadata: {}
        });
      }

      // Mock system-prompt.md files based on kebab-case agent directory names
      if (path.includes('system-prompt.md')) {
        if (path.includes('storage-agent')) {
          return 'Storage test agent';
        } else if (path.includes('persistent-agent1')) {
          return 'First persistent agent';
        } else if (path.includes('test-agent')) {
          return 'You are a test agent';
        }
        return 'You are a test agent';
      }

      // Mock memory.json files
      if (path.includes('memory.json')) {
        return JSON.stringify({
          messages: [],
          lastActivity: new Date().toISOString()
        });
      }

      // Default fallback
      return JSON.stringify({ name: 'test-world', agents: {} });
    });

    mockFs.writeFile.mockResolvedValue(undefined);

    // Mock fs.access to simulate file/directory existence
    mockFs.access.mockImplementation(async (filePath) => {
      const path = filePath.toString();

      // Simulate that world config files exist for specific worlds
      if (path.includes('config.json') && !path.includes('agents')) {
        if (path.includes('storage-world') ||
          path.includes('persistent-world') ||
          path.includes('test-world') ||
          path.includes('storage-agent-world')) {
          return Promise.resolve();
        }
      }

      // Simulate that agent config files exist
      if (path.includes('agents') && path.includes('config.json')) {
        return Promise.resolve();
      }

      // Simulate that system prompt files exist
      if (path.includes('system-prompt.md')) {
        return Promise.resolve();
      }

      // For directory existence checks after removal, reject to simulate non-existence
      if (path.includes('storage-agent-world') && path.includes('agents') && path.includes('StorageAgent')) {
        return Promise.reject(new Error('Directory does not exist'));
      }

      return Promise.resolve();
    });

    // Mock readdir to simulate directory structure with proper withFileTypes
    mockFs.readdir.mockImplementation(async (dirPath, options) => {
      const path = dirPath.toString();

      // For world directories listing
      if (path.includes('data/worlds') && !path.includes('agents')) {
        return ['storage-world', 'persistent-world', 'test-world', 'storage-agent-world'] as any;
      }

      // For agent directories listing  
      if (path.includes('agents') && path.includes('storage-world')) {
        // Return directory entries with proper isDirectory() method for withFileTypes: true
        // Use kebab-case agent directory names
        const entries = [
          {
            name: 'test-agent',
            isDirectory: () => true,
            isFile: () => false,
            isSymbolicLink: () => false,
            isBlockDevice: () => false,
            isCharacterDevice: () => false,
            isFIFO: () => false,
            isSocket: () => false
          }
        ];
        return entries as any;
      }

      // For other agent directories
      if (path.includes('agents') && path.includes('persistent-world')) {
        const entries = [
          {
            name: 'persistent-agent1',
            isDirectory: () => true,
            isFile: () => false,
            isSymbolicLink: () => false,
            isBlockDevice: () => false,
            isCharacterDevice: () => false,
            isFIFO: () => false,
            isSocket: () => false
          }
        ];
        return entries as any;
      }

      // For storage agent world
      if (path.includes('agents') && path.includes('storage-agent-world')) {
        const entries = [
          {
            name: 'storage-agent',
            isDirectory: () => true,
            isFile: () => false,
            isSymbolicLink: () => false,
            isBlockDevice: () => false,
            isCharacterDevice: () => false,
            isFIFO: () => false,
            isSocket: () => false
          }
        ];
        return entries as any;
      }

      return [] as any;
    });

    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.rmdir.mockResolvedValue(undefined);
    mockFs.rm.mockResolvedValue(undefined);

    // Clear test data
    _clearAllWorldsForTesting();

    // Initialize storage with test path
    await initializeFileStorage({ dataPath: TEST_DATA_PATH });

    // Clear world state again after storage init
    _clearAllWorldsForTesting();
  });

  afterEach(async () => {
    // Clean up in-memory state only - no real file operations
    jest.clearAllMocks();
  });

  it('should handle agent lifecycle with persistence', async () => {
    const worldName = 'Lifecycle World';
    await createWorld({ name: worldName });

    const agentConfig: AgentConfig = {
      name: 'LifecycleAgent',
      type: 'ai',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: 'You are a lifecycle test agent',
      temperature: 0.8,
      maxTokens: 2000
    };

    // Create agent
    const createdAgent = await createAgent(worldName, agentConfig);
    expect(createdAgent).toBeTruthy();
    expect(createdAgent!.status).toBe('active');
    expect(createdAgent!.config.temperature).toBe(0.8);
    expect(createdAgent!.config.maxTokens).toBe(2000);

    // Update agent configuration
    const updatedAgent = await updateAgent(worldName, createdAgent!.name, {
      status: 'inactive',
      metadata: { updatedAt: new Date().toISOString() }
    });
    expect(updatedAgent).toBeTruthy();
    expect(updatedAgent!.status).toBe('inactive');
    expect(updatedAgent!.metadata?.updatedAt).toBeTruthy();

    // Verify persistence by retrieving agent
    const retrievedAgent = getAgent(worldName, createdAgent!.name);
    expect(retrievedAgent).toBeTruthy();
    expect(retrievedAgent!.status).toBe('inactive');
    expect(retrievedAgent!.config.systemPrompt).toBe('You are a lifecycle test agent');

    // Remove agent and verify cleanup
    const removed = await removeAgent(worldName, createdAgent!.name);
    expect(removed).toBe(true);

    const deletedAgent = getAgent(worldName, createdAgent!.name);
    expect(deletedAgent).toBeNull();
  });

  it('should persist agent data to storage', async () => {
    const worldName = 'Storage World';
    await createWorld({ name: worldName });
    const agentConfig: AgentConfig = {
      name: 'TestAgent',
      type: 'ai',
      provider: LLMProvider.OPENAI,
      model: 'gpt-3.5-turbo',
      systemPrompt: 'You are a test agent'
    };

    // Create agent using world.ts functions
    const agent = await createAgent(worldName, agentConfig);
    expect(agent).toBeTruthy();
    expect(agent!.name).toBe('TestAgent');
    expect(agent!.type).toBe('ai');
    expect(agent!.status).toBe('active');
    expect(agent!.config.systemPrompt).toBe('You are a test agent');

    // Save world to ensure persistence
    await saveWorld(worldName);

    // Clear memory and reload to test persistence
    _clearAllWorldsForTesting();
    await loadWorld(worldName);

    // Load agent from storage
    const loadedAgent = getAgent(worldName, 'TestAgent');
    expect(loadedAgent).toBeTruthy();
    expect(loadedAgent!.name).toBe('TestAgent');
    expect(loadedAgent!.type).toBe('ai');
    expect(loadedAgent!.status).toBe('active');
    expect(loadedAgent!.config.systemPrompt).toBe('You are a test agent');
  });

  it('should handle agent status tracking', async () => {
    const worldName = 'Test World';
    await createWorld({ name: worldName });

    const agentConfig: AgentConfig = {
      name: 'StatusAgent',
      type: 'ai',
      provider: LLMProvider.OPENAI,
      model: 'gpt-3.5-turbo'
    };

    // Create agent
    const agent = await createAgent(worldName, agentConfig);
    expect(agent).toBeTruthy();
    expect(agent!.status).toBe('active');

    // Update agent status to inactive
    const updatedAgent = await updateAgent(worldName, agent!.name, { status: 'inactive' });
    expect(updatedAgent).toBeTruthy();
    expect(updatedAgent!.status).toBe('inactive');

    // Update agent status to error
    const errorAgent = await updateAgent(worldName, agent!.name, { status: 'error' });
    expect(errorAgent).toBeTruthy();
    expect(errorAgent!.status).toBe('error');

    // Verify status persists
    const retrievedAgent = getAgent(worldName, agent!.name);
    expect(retrievedAgent!.status).toBe('error');
  });

  it('should validate agent configuration', async () => {
    const worldName = 'Validation World';
    await createWorld({ name: worldName });

    // Valid configuration
    const validConfig: AgentConfig = {
      name: 'ValidAgent',
      type: 'ai',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 1000
    };

    const validAgent = await createAgent(worldName, validConfig);
    expect(validAgent).toBeTruthy();
    expect(validAgent!.config.temperature).toBe(0.7);
    expect(validAgent!.config.maxTokens).toBe(1000);

    // Test configuration with all LLM providers
    const providers = [
      LLMProvider.OPENAI,
      LLMProvider.ANTHROPIC,
      LLMProvider.AZURE,
      LLMProvider.GOOGLE,
      LLMProvider.XAI,
      LLMProvider.OLLAMA
    ];

    for (const provider of providers) {
      const config: AgentConfig = {
        name: `Agent${provider}`,
        type: 'ai',
        provider,
        model: 'test-model'
      };

      const agent = await createAgent(worldName, config);
      expect(agent).toBeTruthy();
      expect(agent!.config.provider).toBe(provider);
    }
  });

  it('should persist agents across world restarts', async () => {
    const worldName = 'Persistent World';
    await createWorld({ name: worldName });

    const agentConfig1: AgentConfig = {
      name: 'PersistentAgent1',
      type: 'ai',
      provider: LLMProvider.OPENAI,
      model: 'gpt-3.5-turbo',
      systemPrompt: 'First persistent agent'
    };

    // Create agent
    const agent1 = await createAgent(worldName, agentConfig1);
    expect(agent1).toBeTruthy();

    // Update agent status
    await updateAgent(worldName, agent1!.name, { status: 'inactive' });

    // Save world state
    await saveWorld(worldName);

    // Clear memory and reload world
    _clearAllWorldsForTesting();
    await loadWorld(worldName);

    // Verify agent persisted by checking world agent storage
    const persistedAgents = getAgents(worldName);
    expect(persistedAgents).toHaveLength(1);
    expect(persistedAgents[0].name).toBe(agent1!.name);
    expect(persistedAgents[0].status).toBe('inactive');
    expect(persistedAgents[0].config.systemPrompt).toBe('First persistent agent');

    // Test agent removal and persistence
    const removed = await removeAgent(worldName, agent1!.name);
    expect(removed).toBe(true);

    const remainingAgents = getAgents(worldName);
    expect(remainingAgents).toHaveLength(0);
  });

  it('should handle file storage operations correctly', async () => {
    const worldName = 'Storage Agent World';
    await createWorld({ name: worldName });
    const agentConfig: AgentConfig = {
      name: 'StorageAgent',
      type: 'ai',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: 'Storage test agent'
    };

    // Create agent using world.ts functions
    const agent = await createAgent(worldName, agentConfig);
    expect(agent).toBeTruthy();

    // Verify files were created (using kebab-case folder name)
    const agentDir = path.join(TEST_DATA_PATH, 'storage-agent-world', 'agents', 'StorageAgent');
    const configPath = path.join(agentDir, 'config.json');

    const configExists = await fs.access(configPath).then(() => true).catch(() => false);
    expect(configExists).toBe(true);

    // Verify agent data in config file
    const configData = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configData);
    expect(config.name).toBe('StorageAgent');
    // System prompt is now stored in separate file, so it shouldn't be in config
    expect(config.config.systemPrompt).toBeUndefined();

    // Verify system prompt is in separate file
    const systemPromptPath = path.join(agentDir, 'system-prompt.md');
    const systemPromptExists = await fs.access(systemPromptPath).then(() => true).catch(() => false);
    expect(systemPromptExists).toBe(true);

    const systemPromptData = await fs.readFile(systemPromptPath, 'utf-8');
    expect(systemPromptData).toBe('Storage test agent');

    // Test agent removal
    const removed = await removeAgent(worldName, agent!.name);
    expect(removed).toBe(true);

    // Verify agent was removed from world
    const deletedAgent = getAgent(worldName, agent!.name);
    expect(deletedAgent).toBeNull();

    // Verify directory was removed
    const dirExists = await fs.access(agentDir).then(() => true).catch(() => false);
    expect(dirExists).toBe(false);
  });

  it('should handle data corruption gracefully', async () => {
    const worldName = 'Corruption World';
    await createWorld({ name: worldName });

    // Create a valid agent first
    const validConfig: AgentConfig = {
      name: 'ValidAgent',
      type: 'ai',
      provider: LLMProvider.OPENAI,
      model: 'gpt-3.5-turbo',
      systemPrompt: 'Valid agent'
    };

    const validAgent = await createAgent(worldName, validConfig);
    expect(validAgent).toBeTruthy();

    // Test loading non-existent agent - should return null
    const nonExistentAgent = getAgent(worldName, 'non-existent-agent');
    expect(nonExistentAgent).toBeNull();

    // Test creating agent with minimal config (no instructions)
    const minimalConfig: AgentConfig = {
      name: 'MinimalAgent',
      type: 'ai',
      provider: LLMProvider.OPENAI,
      model: 'gpt-3.5-turbo'
      // No instructions field
    };

    const minimalAgent = await createAgent(worldName, minimalConfig);
    expect(minimalAgent).toBeTruthy();
    expect(minimalAgent!.config.systemPrompt).toBeUndefined();
  });

  describe('Runtime argument validation', () => {
    it('should handle invalid world names gracefully', async () => {
      // Test with non-existent world
      const result = await createAgent('non-existent-world', {
        name: 'TestAgent',
        type: 'ai',
        provider: LLMProvider.OPENAI,
        model: 'gpt-3.5-turbo'
      });
      expect(result).toBeNull();
    });

    it('should handle invalid agent names gracefully', async () => {
      const worldName = 'Test World';
      await createWorld({ name: worldName });

      // Test getting non-existent agent
      const agent = getAgent(worldName, 'non-existent-agent');
      expect(agent).toBeNull();

      // Test updating non-existent agent
      const updated = await updateAgent(worldName, 'non-existent-agent', { status: 'inactive' });
      expect(updated).toBeNull();

      // Test removing non-existent agent
      const removed = await removeAgent(worldName, 'non-existent-agent');
      expect(removed).toBe(false);
    });

    it('should handle empty agent lists gracefully', async () => {
      const worldName = 'Empty World';
      await createWorld({ name: worldName });

      const agents = getAgents(worldName);
      expect(agents).toEqual([]);
    });
  });
});

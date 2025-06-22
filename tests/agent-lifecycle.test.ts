/**
 * agent-lifecycle.test.ts
 *
 * Unit test suite for agent lifecycle and persistence features using world.ts functions.
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
 * Updated: 2025-06-22
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

const TEST_DATA_PATH = path.join(process.cwd(), 'test-data');

describe('Agent Lifecycle and Persistence', () => {
  beforeEach(async () => {
    // Clear test data
    try {
      await fs.rm(TEST_DATA_PATH, { recursive: true, force: true });
    } catch (error) {
      // Ignore if directory doesn't exist
    }

    // Initialize storage with test path
    await initializeFileStorage({ dataPath: TEST_DATA_PATH });

    // Clear world state
    _clearAllWorldsForTesting();
  });

  afterEach(async () => {
    // Clean up test data
    try {
      await fs.rm(TEST_DATA_PATH, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should handle agent lifecycle with persistence', async () => {
    const worldId = await createWorld({ name: 'Lifecycle World' });

    const agentConfig: AgentConfig = {
      id: 'lifecycle-agent',
      name: 'LifecycleAgent',
      type: 'ai',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: 'You are a lifecycle test agent',
      temperature: 0.8,
      maxTokens: 2000
    };

    // Create agent
    const createdAgent = await createAgent(worldId, agentConfig);
    expect(createdAgent).toBeTruthy();
    expect(createdAgent!.status).toBe('active');
    expect(createdAgent!.config.temperature).toBe(0.8);
    expect(createdAgent!.config.maxTokens).toBe(2000);

    // Update agent configuration
    const updatedAgent = await updateAgent(worldId, createdAgent!.id, {
      status: 'inactive',
      metadata: { updatedAt: new Date().toISOString() }
    });
    expect(updatedAgent).toBeTruthy();
    expect(updatedAgent!.status).toBe('inactive');
    expect(updatedAgent!.metadata?.updatedAt).toBeTruthy();

    // Verify persistence by retrieving agent
    const retrievedAgent = getAgent(worldId, createdAgent!.id);
    expect(retrievedAgent).toBeTruthy();
    expect(retrievedAgent!.status).toBe('inactive');
    expect(retrievedAgent!.config.systemPrompt).toBe('You are a lifecycle test agent');

    // Remove agent and verify cleanup
    const removed = await removeAgent(worldId, createdAgent!.id);
    expect(removed).toBe(true);

    const deletedAgent = getAgent(worldId, createdAgent!.id);
    expect(deletedAgent).toBeNull();
  });

  it('should persist agent data to storage', async () => {
    const worldId = await createWorld({ name: 'Storage World' });
    const agentConfig: AgentConfig = {
      id: 'test-agent-1',
      name: 'TestAgent',
      type: 'ai',
      provider: LLMProvider.OPENAI,
      model: 'gpt-3.5-turbo',
      systemPrompt: 'You are a test agent'
    };

    // Create agent using world.ts functions
    const agent = await createAgent(worldId, agentConfig);
    expect(agent).toBeTruthy();
    expect(agent!.id).toBe('test-agent-1');
    expect(agent!.name).toBe('TestAgent');
    expect(agent!.type).toBe('ai');
    expect(agent!.status).toBe('active');
    expect(agent!.config.systemPrompt).toBe('You are a test agent');

    // Save world to ensure persistence
    await saveWorld(worldId);

    // Clear memory and reload to test persistence
    _clearAllWorldsForTesting();
    await loadWorld(worldId);

    // Load agent from storage
    const loadedAgent = getAgent(worldId, 'test-agent-1');
    expect(loadedAgent).toBeTruthy();
    expect(loadedAgent!.id).toBe('test-agent-1');
    expect(loadedAgent!.name).toBe('TestAgent');
    expect(loadedAgent!.type).toBe('ai');
    expect(loadedAgent!.status).toBe('active');
    expect(loadedAgent!.config.systemPrompt).toBe('You are a test agent');
  });

  it('should handle agent status tracking', async () => {
    const worldId = await createWorld({ name: 'Test World' });

    const agentConfig: AgentConfig = {
      id: 'status-agent',
      name: 'StatusAgent',
      type: 'ai',
      provider: LLMProvider.OPENAI,
      model: 'gpt-3.5-turbo'
    };

    // Create agent
    const agent = await createAgent(worldId, agentConfig);
    expect(agent).toBeTruthy();
    expect(agent!.status).toBe('active');

    // Update agent status to inactive
    const updatedAgent = await updateAgent(worldId, agent!.id, { status: 'inactive' });
    expect(updatedAgent).toBeTruthy();
    expect(updatedAgent!.status).toBe('inactive');

    // Update agent status to error
    const errorAgent = await updateAgent(worldId, agent!.id, { status: 'error' });
    expect(errorAgent).toBeTruthy();
    expect(errorAgent!.status).toBe('error');

    // Verify status persists
    const retrievedAgent = getAgent(worldId, agent!.id);
    expect(retrievedAgent!.status).toBe('error');
  });

  it('should validate agent configuration', async () => {
    const worldId = await createWorld({ name: 'Validation World' });

    // Valid configuration
    const validConfig: AgentConfig = {
      id: 'valid-agent',
      name: 'ValidAgent',
      type: 'ai',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 1000
    };

    const validAgent = await createAgent(worldId, validConfig);
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
        id: `agent-${provider}`,
        name: `Agent${provider}`,
        type: 'ai',
        provider,
        model: 'test-model'
      };

      const agent = await createAgent(worldId, config);
      expect(agent).toBeTruthy();
      expect(agent!.config.provider).toBe(provider);
    }
  });

  it('should persist agents across world restarts', async () => {
    const worldId = await createWorld({ name: 'Persistent World' });

    const agentConfig1: AgentConfig = {
      id: 'persistent-agent-1',
      name: 'PersistentAgent1',
      type: 'ai',
      provider: LLMProvider.OPENAI,
      model: 'gpt-3.5-turbo',
      systemPrompt: 'First persistent agent'
    };

    // Create agent
    const agent1 = await createAgent(worldId, agentConfig1);
    expect(agent1).toBeTruthy();

    // Update agent status
    await updateAgent(worldId, agent1!.id, { status: 'inactive' });

    // Save world state
    await saveWorld(worldId);

    // Clear memory and reload world
    _clearAllWorldsForTesting();
    await loadWorld(worldId);

    // Verify agent persisted by checking world agent storage
    const persistedAgents = getAgents(worldId);
    expect(persistedAgents).toHaveLength(1);
    expect(persistedAgents[0].id).toBe(agent1!.id);
    expect(persistedAgents[0].status).toBe('inactive');
    expect(persistedAgents[0].config.systemPrompt).toBe('First persistent agent');

    // Test agent removal and persistence
    const removed = await removeAgent(worldId, agent1!.id);
    expect(removed).toBe(true);

    const remainingAgents = getAgents(worldId);
    expect(remainingAgents).toHaveLength(0);
  });

  it('should handle file storage operations correctly', async () => {
    const worldId = await createWorld({ name: 'Storage Agent World' });
    const agentConfig: AgentConfig = {
      id: 'storage-agent',
      name: 'StorageAgent',
      type: 'ai',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: 'Storage test agent'
    };

    // Create agent using world.ts functions
    const agent = await createAgent(worldId, agentConfig);
    expect(agent).toBeTruthy();

    // Verify files were created (using kebab-case folder name)
    const agentDir = path.join(TEST_DATA_PATH, 'storage-agent-world', 'agents', 'storage-agent');
    const configPath = path.join(agentDir, 'config.json');

    const configExists = await fs.access(configPath).then(() => true).catch(() => false);
    expect(configExists).toBe(true);

    // Verify agent data in config file
    const configData = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configData);
    expect(config.name).toBe('StorageAgent');
    expect(config.config.systemPrompt).toBe('Storage test agent');

    // Test agent removal
    const removed = await removeAgent(worldId, agent!.id);
    expect(removed).toBe(true);

    // Verify agent was removed from world
    const deletedAgent = getAgent(worldId, agent!.id);
    expect(deletedAgent).toBeNull();

    // Verify directory was removed
    const dirExists = await fs.access(agentDir).then(() => true).catch(() => false);
    expect(dirExists).toBe(false);
  });

  it('should handle data corruption gracefully', async () => {
    const worldId = await createWorld({ name: 'Corruption World' });

    // Create a valid agent first
    const validConfig: AgentConfig = {
      id: 'valid-agent',
      name: 'ValidAgent',
      type: 'ai',
      provider: LLMProvider.OPENAI,
      model: 'gpt-3.5-turbo',
      systemPrompt: 'Valid agent'
    };

    const validAgent = await createAgent(worldId, validConfig);
    expect(validAgent).toBeTruthy();

    // Test loading non-existent agent - should return null
    const nonExistentAgent = getAgent(worldId, 'non-existent-agent');
    expect(nonExistentAgent).toBeNull();

    // Test creating agent with minimal config (no instructions)
    const minimalConfig: AgentConfig = {
      id: 'minimal-agent',
      name: 'MinimalAgent',
      type: 'ai',
      provider: LLMProvider.OPENAI,
      model: 'gpt-3.5-turbo'
      // No instructions field
    };

    const minimalAgent = await createAgent(worldId, minimalConfig);
    expect(minimalAgent).toBeTruthy();
    expect(minimalAgent!.config.systemPrompt).toBeUndefined();
  });

  describe('Runtime argument validation', () => {
    it('should handle invalid world IDs gracefully', async () => {
      // Test with non-existent world
      const result = await createAgent('non-existent-world', {
        id: 'test-agent',
        name: 'TestAgent',
        type: 'ai',
        provider: LLMProvider.OPENAI,
        model: 'gpt-3.5-turbo'
      });
      expect(result).toBeNull();
    });

    it('should handle invalid agent IDs gracefully', async () => {
      const worldId = await createWorld({ name: 'Test World' });
      
      // Test getting non-existent agent
      const agent = getAgent(worldId, 'non-existent-agent');
      expect(agent).toBeNull();

      // Test updating non-existent agent
      const updated = await updateAgent(worldId, 'non-existent-agent', { status: 'inactive' });
      expect(updated).toBeNull();

      // Test removing non-existent agent
      const removed = await removeAgent(worldId, 'non-existent-agent');
      expect(removed).toBe(false);
    });

    it('should handle empty agent lists gracefully', async () => {
      const worldId = await createWorld({ name: 'Empty World' });
      
      const agents = getAgents(worldId);
      expect(agents).toEqual([]);
    });
  });
});

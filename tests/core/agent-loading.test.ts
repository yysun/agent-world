/**
 * Unit Tests for Enhanced Agent Loading (Phase 2)
 * 
 * Tests:
 * - Enhanced loading with retry mechanism
 * - Batch loading optimization
 * - Agent integrity validation and repair
 * - Runtime agent registration
 * - World synchronization
 * - Error recovery and partial loading
 * - Performance optimization features
 * 
 * Coverage:
 * - core/agent-storage.ts enhanced loading functions
 * - core/agent-manager.ts runtime registration
 * - Error handling and recovery scenarios
 * - Batch operations and concurrency control
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import {
  loadAgentFromDiskWithRetry,
  loadAllAgentsFromDiskBatch,
  validateAgentIntegrity,
  repairAgentData,
  type AgentLoadOptions,
  type BatchLoadResult
} from '../../core/agent-storage.js';
import {
  registerAgentRuntime,
  loadAgentsIntoWorld,
  syncWorldAgents,
  createAgentsBatch,
  type BatchCreateParams,
  type RuntimeRegistrationOptions
} from '../../core/agent-manager.js';
import { getWorld, createWorld, deleteWorld } from '../../core/world-manager.js';
import { LLMProvider } from '../../core/types.js';
import {
  setupTestEnvironment,
  cleanupTestEnvironment,
  createTestWorldConfig,
  createTestAgentConfig,
  createTestAgent,
  writeTestAgent,
  createCorruptedAgentData,
  validateWorldAgentRelationship
} from './test-helpers.js';

describe('Enhanced Agent Loading (Phase 2)', () => {
  const testWorldId = 'test-loading-world';
  let testDataPath: string;

  beforeEach(async () => {
    testDataPath = await setupTestEnvironment();
    process.env.AGENT_WORLD_DATA_PATH = testDataPath;
    process.env.AGENT_WORLD_ID = testWorldId;

    // Clean up any existing world first
    try {
      await deleteWorld(testWorldId);
    } catch {
      // Ignore if world doesn't exist
    }

    // Create test world
    const worldConfig = createTestWorldConfig(testWorldId);
    await createWorld(worldConfig);
  });

  afterEach(async () => {
    // Clean up world before general cleanup
    try {
      await deleteWorld(testWorldId);
    } catch {
      // Ignore if world doesn't exist
    }

    await cleanupTestEnvironment(testDataPath);
    delete process.env.AGENT_WORLD_DATA_PATH;
    delete process.env.AGENT_WORLD_ID;
  });

  describe('Enhanced Loading with Retry', () => {
    it('should load agent with default options', async () => {
      const agentConfig = createTestAgent('retry-agent-1');
      await writeTestAgent(testWorldId, agentConfig);

      const loaded = await loadAgentFromDiskWithRetry(testWorldId, 'retry-agent-1');

      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe('retry-agent-1');
      expect(loaded!.config.name).toBe('Test Agent retry-agent-1');
      expect(loaded!.memory).toHaveLength(0);
    });

    it('should load agent without memory when includeMemory is false', async () => {
      const agentConfig = createTestAgent('retry-agent-2');
      agentConfig.memory = [
        { role: 'user', content: 'Test message', createdAt: new Date() },
        { role: 'assistant', content: 'Test response', createdAt: new Date() }
      ];
      await writeTestAgent(testWorldId, agentConfig);

      const options: AgentLoadOptions = { includeMemory: false };
      const loaded = await loadAgentFromDiskWithRetry(testWorldId, 'retry-agent-2', options);

      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe('retry-agent-2');
      expect(loaded!.memory).toHaveLength(0);
    });

    it('should retry loading on transient failures', async () => {
      const agentConfig = createTestAgentConfig('retry-agent-3');
      await writeTestAgent(testWorldId, agentConfig);

      // Simulate transient failure by temporarily removing config file
      const agentDir = path.join(testDataPath, testWorldId, 'agents', 'retry-agent-3');
      const configPath = path.join(agentDir, 'config.json');
      const configBackup = await fs.readFile(configPath, 'utf8');

      // Remove config file temporarily
      await fs.unlink(configPath);

      const loadPromise = loadAgentFromDiskWithRetry(testWorldId, 'retry-agent-3', {
        retryCount: 3,
        retryDelay: 50
      });

      // Restore config file after a short delay
      setTimeout(async () => {
        await fs.writeFile(configPath, configBackup, 'utf8');
      }, 100);

      const loaded = await loadPromise;
      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe('retry-agent-3');
    });

    it('should return null after exhausting retries', async () => {
      const options: AgentLoadOptions = {
        retryCount: 2,
        retryDelay: 10
      };

      const loaded = await loadAgentFromDiskWithRetry(testWorldId, 'non-existent-agent', options);
      expect(loaded).toBeNull();
    });

    it('should allow partial loading when allowPartialLoad is true', async () => {
      const agentConfig = createTestAgentConfig('partial-agent-1');
      await writeTestAgent(testWorldId, agentConfig);

      // Remove system prompt file
      const agentDir = path.join(testDataPath, testWorldId, 'agents', 'partial-agent-1');
      const systemPromptPath = path.join(agentDir, 'system-prompt.md');
      await fs.unlink(systemPromptPath);

      const options: AgentLoadOptions = {
        allowPartialLoad: true,
        validateIntegrity: false
      };

      const loaded = await loadAgentFromDiskWithRetry(testWorldId, 'partial-agent-1', options);
      expect(loaded).not.toBeNull();
      expect(loaded!.config.systemPrompt).toBe('You are partial-agent-1, an AI agent.');
    });
  });

  describe('Agent Integrity Validation', () => {
    it('should validate complete agent integrity', async () => {
      const agentConfig = createTestAgentConfig('integrity-agent-1');
      await writeTestAgent(testWorldId, agentConfig);

      const integrity = await validateAgentIntegrity(testWorldId, 'integrity-agent-1');

      expect(integrity.isValid).toBe(true);
      expect(integrity.hasConfig).toBe(true);
      expect(integrity.hasSystemPrompt).toBe(true);
      expect(integrity.hasMemory).toBe(true);
      expect(integrity.errors).toHaveLength(0);
    });

    it('should detect missing config file', async () => {
      const agentConfig = createTestAgentConfig('integrity-agent-2');
      await writeTestAgent(testWorldId, agentConfig);

      // Remove config file
      const agentDir = path.join(testDataPath, testWorldId, 'agents', 'integrity-agent-2');
      const configPath = path.join(agentDir, 'config.json');
      await fs.unlink(configPath);

      const integrity = await validateAgentIntegrity(testWorldId, 'integrity-agent-2');

      expect(integrity.isValid).toBe(false);
      expect(integrity.hasConfig).toBe(false);
      expect(integrity.errors).toContain('Missing config.json file');
    });

    it('should detect missing system prompt and memory files', async () => {
      const agentConfig = createTestAgentConfig('integrity-agent-3');
      await writeTestAgent(testWorldId, agentConfig);

      const agentDir = path.join(testDataPath, testWorldId, 'agents', 'integrity-agent-3');

      // Remove system prompt and memory files
      await fs.unlink(path.join(agentDir, 'system-prompt.md'));
      await fs.unlink(path.join(agentDir, 'memory.json'));

      const integrity = await validateAgentIntegrity(testWorldId, 'integrity-agent-3');

      expect(integrity.isValid).toBe(true); // Still valid with just config
      expect(integrity.hasSystemPrompt).toBe(false);
      expect(integrity.hasMemory).toBe(false);
      expect(integrity.warnings).toContain('Missing system-prompt.md file');
      expect(integrity.warnings).toContain('Missing memory.json file');
    });

    it('should detect corrupted memory file', async () => {
      const agentConfig = createTestAgentConfig('integrity-agent-4');
      await writeTestAgent(testWorldId, agentConfig);

      // Corrupt memory file
      const agentDir = path.join(testDataPath, testWorldId, 'agents', 'integrity-agent-4');
      const memoryPath = path.join(agentDir, 'memory.json');
      await fs.writeFile(memoryPath, 'invalid json content', 'utf8');

      const integrity = await validateAgentIntegrity(testWorldId, 'integrity-agent-4');

      expect(integrity.isValid).toBe(false);
      expect(integrity.errors).toContain('Corrupted memory.json file');
    });
  });

  describe('Agent Data Repair', () => {
    it('should repair missing system prompt file', async () => {
      const agentConfig = createTestAgentConfig('repair-agent-1');
      await writeTestAgent(testWorldId, agentConfig);

      // Remove system prompt file
      const agentDir = path.join(testDataPath, testWorldId, 'agents', 'repair-agent-1');
      const systemPromptPath = path.join(agentDir, 'system-prompt.md');
      await fs.unlink(systemPromptPath);

      const repaired = await repairAgentData(testWorldId, 'repair-agent-1');
      expect(repaired).toBe(true);

      // Verify repair
      const integrity = await validateAgentIntegrity(testWorldId, 'repair-agent-1');
      expect(integrity.hasSystemPrompt).toBe(true);

      const content = await fs.readFile(systemPromptPath, 'utf8');
      expect(content).toBe('You are repair-agent-1, an AI agent.');
    });

    it('should repair missing memory file', async () => {
      const agentConfig = createTestAgentConfig('repair-agent-2');
      await writeTestAgent(testWorldId, agentConfig);

      // Remove memory file
      const agentDir = path.join(testDataPath, testWorldId, 'agents', 'repair-agent-2');
      const memoryPath = path.join(agentDir, 'memory.json');
      await fs.unlink(memoryPath);

      const repaired = await repairAgentData(testWorldId, 'repair-agent-2');
      expect(repaired).toBe(true);

      // Verify repair
      const integrity = await validateAgentIntegrity(testWorldId, 'repair-agent-2');
      expect(integrity.hasMemory).toBe(true);

      const memoryData = JSON.parse(await fs.readFile(memoryPath, 'utf8'));
      expect(Array.isArray(memoryData)).toBe(true);
      expect(memoryData).toHaveLength(0);
    });

    it('should return false when repair fails', async () => {
      const repaired = await repairAgentData(testWorldId, 'non-existent-agent');
      expect(repaired).toBe(false);
    });
  });

  describe('Batch Loading', () => {
    it('should load multiple agents in batch', async () => {
      // Create test agents
      const agentConfigs = [
        createTestAgentConfig('batch-agent-1'),
        createTestAgentConfig('batch-agent-2'),
        createTestAgentConfig('batch-agent-3')
      ];

      for (const config of agentConfigs) {
        await writeTestAgent(testWorldId, config);
      }

      const result = await loadAllAgentsFromDiskBatch(testWorldId);

      expect(result.totalCount).toBe(3);
      expect(result.successCount).toBe(3);
      expect(result.failureCount).toBe(0);
      expect(result.successful).toHaveLength(3);
      expect(result.failed).toHaveLength(0);

      const agentIds = result.successful.map(agent => agent.id);
      expect(agentIds).toContain('batch-agent-1');
      expect(agentIds).toContain('batch-agent-2');
      expect(agentIds).toContain('batch-agent-3');
    });

    it('should handle partial failures in batch loading', async () => {
      // Create one valid agent
      const validConfig = createTestAgentConfig('batch-valid-1');
      await writeTestAgent(testWorldId, validConfig);

      // Create one corrupted agent
      const corruptedConfig = createTestAgentConfig('batch-corrupted-1');
      await writeTestAgent(testWorldId, corruptedConfig);

      // Corrupt the config file
      const agentDir = path.join(testDataPath, testWorldId, 'agents', 'batch-corrupted-1');
      const configPath = path.join(agentDir, 'config.json');
      await fs.writeFile(configPath, 'invalid json', 'utf8');

      const result = await loadAllAgentsFromDiskBatch(testWorldId);

      expect(result.totalCount).toBe(2);
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(1);
      expect(result.successful).toHaveLength(1);
      expect(result.failed).toHaveLength(1);

      expect(result.successful[0].id).toBe('batch-valid-1');
      expect(result.failed[0].agentId).toBe('batch-corrupted-1');
    });

    it('should respect loading options in batch loading', async () => {
      const agentConfig = createTestAgent('batch-option-1');
      agentConfig.memory = [
        { role: 'user', content: 'Test message', createdAt: new Date() }
      ];
      await writeTestAgent(testWorldId, agentConfig);

      const options: AgentLoadOptions = { includeMemory: false };
      const result = await loadAllAgentsFromDiskBatch(testWorldId, options);

      expect(result.successCount).toBe(1);
      expect(result.successful[0].memory).toHaveLength(0);
    });
  });

  describe('Runtime Agent Registration', () => {
    it('should register agent in world runtime', async () => {
      const agentConfig = createTestAgent('runtime-agent-1');
      const world = await getWorld(testWorldId);
      expect(world).not.toBeNull();

      const registered = await registerAgentRuntime(agentConfig);
      expect(registered).toBe(true);

      // Verify agent is in world Map
      expect(world!.agents.has('runtime-agent-1')).toBe(true);
      const worldAgent = world!.agents.get('runtime-agent-1');
      expect(worldAgent!.id).toBe('runtime-agent-1');
    });

    it('should subscribe agent to events by default', async () => {
      const agentConfig = createTestAgent('runtime-agent-2');

      const registered = await registerAgentRuntime(agentConfig);
      expect(registered).toBe(true);

      // Subscription tracking is tested in agent-events.test.ts
      // Here we just verify the registration succeeds
    });

    it('should handle registration with custom options', async () => {
      const agentConfig = createTestAgent('runtime-agent-3');
      const options: RuntimeRegistrationOptions = {
        subscribeToEvents: false,
        updateWorldMap: true,
        validateAgent: true
      };

      const registered = await registerAgentRuntime(agentConfig, options);
      expect(registered).toBe(true);

      const world = await getWorld(testWorldId);
      expect(world!.agents.has('runtime-agent-3')).toBe(true);
    });

    it('should fail registration for invalid agent', async () => {
      const invalidAgent = { id: '', type: '', config: null } as any;
      const options: RuntimeRegistrationOptions = { validateAgent: true };

      const registered = await registerAgentRuntime(invalidAgent, options);
      expect(registered).toBe(false);
    });
  });

  describe('World Synchronization', () => {
    it('should load all agents into world runtime', async () => {
      // Create test agents
      const agentConfigs = [
        createTestAgentConfig('sync-agent-1'),
        createTestAgentConfig('sync-agent-2')
      ];

      for (const config of agentConfigs) {
        await writeTestAgent(testWorldId, config);
      }

      const result = await loadAgentsIntoWorld();

      expect(result.loadedCount).toBe(2);
      expect(result.errorCount).toBe(0);
      expect(result.repairedCount).toBe(0);

      // Verify agents are in world Map
      const world = await getWorld(testWorldId);
      expect(world!.agents.size).toBe(2);
      expect(world!.agents.has('sync-agent-1')).toBe(true);
      expect(world!.agents.has('sync-agent-2')).toBe(true);
    });

    it('should repair corrupted agents during sync', async () => {
      // Create one valid agent
      const validConfig = createTestAgentConfig('sync-valid-1');
      await writeTestAgent(testWorldId, validConfig);

      // Create one agent with missing system prompt
      const incompleteConfig = createTestAgentConfig('sync-incomplete-1');
      await writeTestAgent(testWorldId, incompleteConfig);

      // Remove system prompt
      const agentDir = path.join(testDataPath, testWorldId, 'agents', 'sync-incomplete-1');
      const systemPromptPath = path.join(agentDir, 'system-prompt.md');
      await fs.unlink(systemPromptPath);

      const result = await loadAgentsIntoWorld({ repairCorrupted: true });

      expect(result.loadedCount).toBe(2);
      expect(result.repairedCount).toBe(1);
      expect(result.errorCount).toBe(0);

      // Verify repair worked
      const world = await getWorld(testWorldId);
      expect(world!.agents.size).toBe(2);
    });

    it('should handle sync errors gracefully', async () => {
      // Create agent with severely corrupted config
      const agentConfig = createTestAgentConfig('sync-corrupted-1');
      await writeTestAgent(testWorldId, agentConfig);

      const agentDir = path.join(testDataPath, testWorldId, 'agents', 'sync-corrupted-1');
      const configPath = path.join(agentDir, 'config.json');
      await fs.writeFile(configPath, 'completely invalid json content', 'utf8');

      const result = await loadAgentsIntoWorld({ repairCorrupted: false });

      expect(result.loadedCount).toBe(0);
      expect(result.errorCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].agentId).toBe('sync-corrupted-1');
    });

    it('should clear world agents before sync', async () => {
      const world = await getWorld(testWorldId);

      // Add some agents to world Map manually
      const dummyAgent = createTestAgent('dummy-agent');
      world!.agents.set('dummy-agent', dummyAgent);

      expect(world!.agents.size).toBe(1);

      // Sync with empty disk state
      const result = await loadAgentsIntoWorld();

      expect(result.loadedCount).toBe(0);
      expect(world!.agents.size).toBe(0);
    });
  });

  describe('Batch Agent Creation', () => {
    it('should create multiple agents in batch', async () => {
      const params: BatchCreateParams = {
        agents: [
          {
            id: 'batch-create-1',
            name: 'Batch Agent 1',
            type: 'test',
            provider: LLMProvider.OPENAI,
            model: 'gpt-4'
          },
          {
            id: 'batch-create-2',
            name: 'Batch Agent 2',
            type: 'test',
            provider: LLMProvider.OPENAI,
            model: 'gpt-4'
          }
        ]
      };

      const result = await createAgentsBatch(params);

      expect(result.totalCount).toBe(2);
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(0);

      // Verify agents exist in world
      const world = await getWorld(testWorldId);
      expect(world!.agents.has('batch-create-1')).toBe(true);
      expect(world!.agents.has('batch-create-2')).toBe(true);
    });

    it('should handle partial failures in batch creation', async () => {
      // Create one agent first to cause duplicate error
      const existingConfig = createTestAgentConfig('duplicate-agent');
      await writeTestAgent(testWorldId, existingConfig);

      const params: BatchCreateParams = {
        agents: [
          {
            id: 'batch-new-1',
            name: 'New Agent',
            type: 'test',
            provider: LLMProvider.OPENAI,
            model: 'gpt-4'
          },
          {
            id: 'duplicate-agent', // This will fail
            name: 'Duplicate Agent',
            type: 'test',
            provider: LLMProvider.OPENAI,
            model: 'gpt-4'
          }
        ],
        failOnError: false
      };

      const result = await createAgentsBatch(params);

      expect(result.totalCount).toBe(2);
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(1);
      expect(result.successful).toHaveLength(1);
      expect(result.failed).toHaveLength(1);

      expect(result.successful[0].id).toBe('batch-new-1');
      expect(result.failed[0].params.id).toBe('duplicate-agent');
    });

    it('should stop on first error when failOnError is true', async () => {
      const params: BatchCreateParams = {
        agents: [
          {
            id: '', // Invalid ID will cause error
            name: 'Invalid Agent',
            type: 'test',
            provider: LLMProvider.OPENAI,
            model: 'gpt-4'
          },
          {
            id: 'valid-agent',
            name: 'Valid Agent',
            type: 'test',
            provider: LLMProvider.OPENAI,
            model: 'gpt-4'
          }
        ],
        failOnError: true
      };

      await expect(createAgentsBatch(params)).rejects.toThrow();
    });
  });
});

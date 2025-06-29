/**
 * Unit Tests for Enhanced Agent Loading (Phase 2) - Fixed with Mocks
 * 
 * Tests:
 * - Enhanced loading with retry mechanism using file system mocks
 * - Agent integrity validation with mocked file operations
 * - Error handling and recovery scenarios with mocked failures
 * 
 * Implementation:
 * - Uses file system mocks instead of real file operations
 * - Tests only storage functions, not world/agent creation
 * - Follows coding instructions: only mock file I/O and LLM
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  loadAgentFromDiskWithRetry,
  loadAllAgentsFromDiskBatch,
  validateAgentIntegrity,
  repairAgentData,
  type AgentLoadOptions,
  type BatchLoadResult
} from '../../core/agent-storage.js';
import { LLMProvider, Agent } from '../../core/types.js';

// Mock fs module - this will be the mocked version
jest.mock('fs');
const fs = require('fs').promises;

describe('Enhanced Agent Loading (Phase 2) - With Mocks', () => {
  const testWorldId = 'test-loading-world';

  // Mock file system state - maps file paths to content
  let mockFileSystem: { [path: string]: string } = {};

  beforeEach(async () => {
    // Clear mock file system state for test isolation
    mockFileSystem = {};

    // Setup environment for correct paths
    process.env.AGENT_WORLD_DATA_PATH = 'test-data/worlds';

    // Setup mocks for each test with isolated state
    fs.readFile.mockImplementation(async (path: any, encoding?: any): Promise<any> => {
      const pathStr = path.toString();

      if (mockFileSystem[pathStr]) {
        return mockFileSystem[pathStr];
      }

      // Simulate file not found error
      const error = new Error(`ENOENT: no such file or directory, open '${pathStr}'`);
      (error as any).code = 'ENOENT';
      throw error;
    });

    fs.writeFile.mockImplementation(async (path: any, data: any): Promise<void> => {
      const pathStr = path.toString();
      mockFileSystem[pathStr] = data.toString();
    });

    fs.mkdir.mockImplementation(async (path: any, options?: any): Promise<void> => {
      // Just return success - we don't need to track directories in our mock
    });

    fs.rm.mockImplementation(async (path: any, options?: any): Promise<void> => {
      const pathStr = path.toString();
      // Remove files with matching path prefix
      Object.keys(mockFileSystem).forEach(key => {
        if (key.startsWith(pathStr)) {
          delete mockFileSystem[key];
        }
      });
    });

    fs.access.mockImplementation(async (path: any): Promise<void> => {
      const pathStr = path.toString();
      if (!mockFileSystem[pathStr]) {
        const error = new Error(`ENOENT: no such file or directory, access '${pathStr}'`);
        (error as any).code = 'ENOENT';
        throw error;
      }
    });

    fs.readdir.mockImplementation(async (path: any, options?: any): Promise<any> => {
      const pathStr = path.toString();

      if (options && options.withFileTypes) {
        // Return directory entries with isDirectory method for batch loading
        // Extract directory names from the mock file system
        const subdirs = new Set<string>();
        Object.keys(mockFileSystem).forEach(filePath => {
          if (filePath.startsWith(pathStr + '/')) {
            const relativePath = filePath.substring(pathStr.length + 1);
            const firstSegment = relativePath.split('/')[0];
            if (firstSegment && relativePath.includes('/')) {
              subdirs.add(firstSegment);
            }
          }
        });

        return Array.from(subdirs).map(name => ({
          name,
          isDirectory: () => true
        }));
      } else {
        // Return simple string array
        const subdirs = new Set<string>();
        Object.keys(mockFileSystem).forEach(filePath => {
          if (filePath.startsWith(pathStr + '/')) {
            const relativePath = filePath.substring(pathStr.length + 1);
            const firstSegment = relativePath.split('/')[0];
            if (firstSegment && relativePath.includes('/')) {
              subdirs.add(firstSegment);
            }
          }
        });
        return Array.from(subdirs);
      }
    });

    fs.rename.mockImplementation(async (oldPath: any, newPath: any): Promise<void> => {
      const oldPathStr = oldPath.toString();
      const newPathStr = newPath.toString();
      if (mockFileSystem[oldPathStr]) {
        mockFileSystem[newPathStr] = mockFileSystem[oldPathStr];
        delete mockFileSystem[oldPathStr];
      }
    });
  });

  afterEach(() => {
    // Clear mocks after each test
    jest.clearAllMocks();
    mockFileSystem = {};
    delete process.env.AGENT_WORLD_DATA_PATH;
  });

  // Helper function to create mock agent data
  const createMockAgent = (agentId: string, name?: string): Agent => ({
    id: agentId,
    name: name || `Test Agent ${agentId}`,
    type: 'assistant',
    status: 'active' as const,
    provider: LLMProvider.OPENAI,
    model: 'gpt-4',
    systemPrompt: `System prompt for ${agentId}`,
    temperature: 0.7,
    maxTokens: 1000,
    createdAt: new Date('2023-01-01T00:00:00Z'),
    lastActive: new Date('2023-01-01T00:00:00Z'),
    llmCallCount: 0,
    memory: []
  });

  // Helper function to write mock agent to file system
  const writeMockAgent = async (worldId: string, agent: Agent): Promise<void> => {
    const basePath = `test-data/worlds/${worldId}/agents/${agent.id}`;

    // Write config.json with full agent structure (what the loader expects)
    mockFileSystem[`${basePath}/config.json`] = JSON.stringify({
      id: agent.id,
      name: agent.name,
      type: agent.type,
      status: agent.status,
      provider: agent.provider,
      model: agent.model,
      apiKey: agent.apiKey,
      baseUrl: agent.baseUrl,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      azureEndpoint: agent.azureEndpoint,
      azureApiVersion: agent.azureApiVersion,
      azureDeployment: agent.azureDeployment,
      ollamaBaseUrl: agent.ollamaBaseUrl,
      createdAt: agent.createdAt?.toISOString(),
      lastActive: agent.lastActive?.toISOString(),
      llmCallCount: agent.llmCallCount,
      lastLLMCall: agent.lastLLMCall?.toISOString()
    }, null, 2);

    // Write system-prompt.md
    if (agent.systemPrompt) {
      mockFileSystem[`${basePath}/system-prompt.md`] = agent.systemPrompt;
    }

    // Write memory.json
    mockFileSystem[`${basePath}/memory.json`] = JSON.stringify(agent.memory, null, 2);
  };

  describe('Enhanced Loading with Retry', () => {
    it('should load agent with default options', async () => {
      const agent = createMockAgent('retry-agent-1');
      await writeMockAgent(testWorldId, agent);

      const loaded = await loadAgentFromDiskWithRetry('test-data/worlds', testWorldId, 'retry-agent-1');

      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe('retry-agent-1');
      expect(loaded!.name).toBe('Test Agent retry-agent-1');
      expect(loaded!.memory).toHaveLength(0);
    });

    it('should load agent without memory when includeMemory is false', async () => {
      const agent = createMockAgent('retry-agent-2');
      agent.memory = [
        { role: 'user', content: 'Hello', createdAt: new Date() },
        { role: 'assistant', content: 'Hi there!', createdAt: new Date() }
      ];
      await writeMockAgent(testWorldId, agent);

      const options: AgentLoadOptions = { includeMemory: false };
      const loaded = await loadAgentFromDiskWithRetry('test-data/worlds', testWorldId, 'retry-agent-2', options);

      expect(loaded).not.toBeNull();
      expect(loaded!.memory).toHaveLength(0);
    });

    it('should retry loading on transient failures', async () => {
      const agent = createMockAgent('retry-agent-3');
      await writeMockAgent(testWorldId, agent);

      let callCount = 0;
      fs.readFile.mockImplementation(async (path: any, encoding?: any): Promise<any> => {
        const pathStr = path.toString();
        callCount++;

        // Fail first two attempts, succeed on third
        if (callCount <= 2) {
          const error = new Error('EMFILE: too many open files');
          (error as any).code = 'EMFILE';
          throw error;
        }

        if (mockFileSystem[pathStr]) {
          return mockFileSystem[pathStr];
        }

        const error = new Error(`ENOENT: no such file or directory, open '${pathStr}'`);
        (error as any).code = 'ENOENT';
        throw error;
      });

      const options: AgentLoadOptions = { retryCount: 3, retryDelay: 10 };
      const loaded = await loadAgentFromDiskWithRetry('test-data/worlds', testWorldId, 'retry-agent-3', options);

      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe('retry-agent-3');
      expect(callCount).toBeGreaterThan(2); // Should have retried
    });

    it('should return null after exhausting retries', async () => {
      const agent = createMockAgent('retry-agent-4');
      await writeMockAgent(testWorldId, agent);

      // Always fail
      fs.readFile.mockImplementation(async (path: any, encoding?: any): Promise<any> => {
        const error = new Error('EMFILE: too many open files');
        (error as any).code = 'EMFILE';
        throw error;
      });

      const options: AgentLoadOptions = { retryCount: 2, retryDelay: 10 };
      const loaded = await loadAgentFromDiskWithRetry('test-data/worlds', testWorldId, 'retry-agent-4', options);

      expect(loaded).toBeNull();
    });

    it('should allow partial loading when allowPartialLoad is true', async () => {
      const agent = createMockAgent('partial-agent-1');
      await writeMockAgent(testWorldId, agent);

      // Remove system prompt to create partial data
      delete mockFileSystem[`test-data/worlds/${testWorldId}/agents/partial-agent-1/system-prompt.md`];

      const options: AgentLoadOptions = { allowPartialLoad: true };
      const loaded = await loadAgentFromDiskWithRetry('test-data/worlds', testWorldId, 'partial-agent-1', options);

      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe('partial-agent-1');
      // The fallback creates a personalized system prompt with the agent ID
      expect(loaded!.systemPrompt).toBe('You are partial-agent-1, an AI agent.');
    });
  });

  describe('Agent Integrity Validation', () => {
    it('should validate complete agent integrity', async () => {
      const agent = createMockAgent('integrity-agent-1');
      await writeMockAgent(testWorldId, agent);

      const integrity = await validateAgentIntegrity('test-data/worlds', testWorldId, 'integrity-agent-1');

      expect(integrity.isValid).toBe(true);
      expect(integrity.errors).toHaveLength(0);
      expect(integrity.warnings).toHaveLength(0);
    });

    it('should detect missing config file', async () => {
      const agent = createMockAgent('integrity-agent-2');
      await writeMockAgent(testWorldId, agent);

      // Remove config file
      delete mockFileSystem[`test-data/worlds/${testWorldId}/agents/integrity-agent-2/config.json`];

      const integrity = await validateAgentIntegrity('test-data/worlds', testWorldId, 'integrity-agent-2');

      expect(integrity.isValid).toBe(false);
      expect(integrity.hasConfig).toBe(false);
    });

    it('should detect corrupted memory file', async () => {
      const agent = createMockAgent('integrity-agent-3');
      await writeMockAgent(testWorldId, agent);

      // Corrupt memory file
      mockFileSystem[`test-data/worlds/${testWorldId}/agents/integrity-agent-3/memory.json`] = 'invalid json{';

      const integrity = await validateAgentIntegrity('test-data/worlds', testWorldId, 'integrity-agent-3');

      expect(integrity.isValid).toBe(false);
      expect(integrity.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Agent Data Repair', () => {
    it('should repair missing system prompt file', async () => {
      const agent = createMockAgent('repair-agent-1');
      await writeMockAgent(testWorldId, agent);

      // Remove system prompt
      delete mockFileSystem[`test-data/worlds/${testWorldId}/agents/repair-agent-1/system-prompt.md`];

      const repaired = await repairAgentData('test-data/worlds', testWorldId, 'repair-agent-1');

      expect(repaired).toBe(true);
      expect(mockFileSystem[`test-data/worlds/${testWorldId}/agents/repair-agent-1/system-prompt.md`]).toBeDefined();
    });

    it('should repair missing memory file', async () => {
      const agent = createMockAgent('repair-agent-2');
      await writeMockAgent(testWorldId, agent);

      // Remove memory file
      delete mockFileSystem[`test-data/worlds/${testWorldId}/agents/repair-agent-2/memory.json`];

      const repaired = await repairAgentData('test-data/worlds', testWorldId, 'repair-agent-2');

      expect(repaired).toBe(true);
      expect(mockFileSystem[`test-data/worlds/${testWorldId}/agents/repair-agent-2/memory.json`]).toBe('[]');
    });

    it('should return false when repair fails', async () => {
      // Make the writeFile operations fail for the non-existent agent
      const originalWriteFile = fs.writeFile;
      fs.writeFile.mockImplementation(async (path: any, data: any): Promise<void> => {
        const pathStr = path.toString();
        if (pathStr.includes('non-existent-agent')) {
          const error = new Error('EACCES: permission denied');
          (error as any).code = 'EACCES';
          throw error;
        }
        // Otherwise store in our mock file system
        mockFileSystem[pathStr] = data.toString();
      });

      const repaired = await repairAgentData('test-data/worlds', testWorldId, 'non-existent-agent');

      expect(repaired).toBe(false);

      // Restore original mock
      fs.writeFile.mockImplementation(originalWriteFile);
    });
  });

  describe('Batch Loading', () => {
    it('should load multiple agents in batch', async () => {
      const agent1 = createMockAgent('batch-agent-1');
      const agent2 = createMockAgent('batch-agent-2');
      await writeMockAgent(testWorldId, agent1);
      await writeMockAgent(testWorldId, agent2);

      const result: BatchLoadResult = await loadAllAgentsFromDiskBatch('test-data/worlds', testWorldId);

      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
      expect(result.successful.map((a: any) => a.id)).toContain('batch-agent-1');
      expect(result.successful.map((a: any) => a.id)).toContain('batch-agent-2');
    });

    it('should handle partial failures in batch loading', async () => {
      const agent1 = createMockAgent('batch-agent-3');
      const agent2 = createMockAgent('batch-agent-4');
      await writeMockAgent(testWorldId, agent1);
      await writeMockAgent(testWorldId, agent2);

      // Corrupt one agent's config
      mockFileSystem[`test-data/worlds/${testWorldId}/agents/batch-agent-4/config.json`] = 'invalid json{';

      const result: BatchLoadResult = await loadAllAgentsFromDiskBatch('test-data/worlds', testWorldId);

      expect(result.successful).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
      expect(result.successful[0].id).toBe('batch-agent-3');
      expect(result.failed[0].agentId).toBe('batch-agent-4');
    });
  });
});

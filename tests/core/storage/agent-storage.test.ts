/**
 * Unit Tests for Agent Storage (Core System)
 *
 * Features:
 * - Tests for listAgents function with mocked file I/O
 * - Tests for agent creation and persistence with mocked file system
 * - Tests for error handling with corrupted files using mocks
 * - Tests for missing files and recovery using mocked scenarios
 * - Tests for data validation and consistency with mocked data
 * - Tests for chatId field support and memory filtering
 * - Tests advanced retry/integrity/batch/archive flows with an in-memory virtual FS
 *
 * Implementation:
 * - Uses mock helpers for consistent test data and file system mocking
 * - Tests only core/agent-storage.ts functions with mocked dependencies
 * - Validates proper Date object reconstruction with mocked data
 * - Tests file system error scenarios using mock failures
 * - Verifies agent memory structure integrity with mocked file content
 * - Tests chatId field preservation and filtering functionality
 * - Exercises production retry + repair + batch loading paths without real filesystem usage
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

// We need to unmock agent-storage for this test since we're testing it
vi.unmock('../../../core/storage/agent-storage');

import {
  listAgents,
  loadAgent,
  saveAgent,
  saveAgentConfig,
  saveAgentMemory,
  archiveAgentMemory,
  loadAgentWithRetry,
  loadAgentsBatch,
  validateAgentIntegrity,
  repairAgentData,
  deleteAgent,
  deleteMemoryByChatId,
  agentExists
} from '../../../core/storage/agent-storage';
import { Agent, LLMProvider } from '../../../core/types';
import { createMockAgent } from '../mock-helpers';

// Get the global fs mock from setup
import * as fsModule from 'fs';
const fs = vi.mocked(fsModule.promises);

const virtualFiles = new Map<string, string>();

function normalizePath(value: string): string {
  return String(value).replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
}

function missingPathError(filePath: string): Error & { code?: string } {
  const err = new Error(`ENOENT: no such file or directory, open '${filePath}'`) as Error & { code?: string };
  err.code = 'ENOENT';
  return err;
}

function seedVirtualFile(filePath: string, content: string): void {
  virtualFiles.set(normalizePath(filePath), content);
}

function hasVirtualPath(pathValue: string): boolean {
  const normalized = normalizePath(pathValue);
  if (virtualFiles.has(normalized)) {
    return true;
  }
  const prefix = `${normalized}/`;
  return Array.from(virtualFiles.keys()).some((key) => key.startsWith(prefix));
}

function setupVirtualFs(): void {
  virtualFiles.clear();

  vi.mocked(fs.readFile).mockImplementation(async (filePath: any) => {
    const normalized = normalizePath(String(filePath));
    if (!virtualFiles.has(normalized)) {
      throw missingPathError(normalized);
    }
    return virtualFiles.get(normalized) as any;
  });

  vi.mocked(fs.writeFile).mockImplementation(async (filePath: any, content: any) => {
    virtualFiles.set(normalizePath(String(filePath)), String(content));
  });

  vi.mocked(fs.rename).mockImplementation(async (fromPath: any, toPath: any) => {
    const from = normalizePath(String(fromPath));
    const to = normalizePath(String(toPath));
    if (!virtualFiles.has(from)) {
      throw missingPathError(from);
    }
    virtualFiles.set(to, virtualFiles.get(from)!);
    virtualFiles.delete(from);
  });

  vi.mocked(fs.access).mockImplementation(async (targetPath: any) => {
    const normalized = normalizePath(String(targetPath));
    if (!hasVirtualPath(normalized)) {
      throw missingPathError(normalized);
    }
  });

  vi.mocked(fs.mkdir).mockResolvedValue(undefined);

  vi.mocked(fs.readdir).mockImplementation(async (dirPath: any, options?: any) => {
    const normalizedDir = normalizePath(String(dirPath));
    const prefix = `${normalizedDir}/`;
    const entries = new Map<string, boolean>();

    for (const filePath of virtualFiles.keys()) {
      if (!filePath.startsWith(prefix)) continue;
      const remainder = filePath.slice(prefix.length);
      if (!remainder) continue;
      const [name, ...rest] = remainder.split('/');
      const isDir = rest.length > 0;
      if (!entries.has(name)) {
        entries.set(name, isDir);
      } else if (isDir) {
        entries.set(name, true);
      }
    }

    if (entries.size === 0 && !hasVirtualPath(normalizedDir)) {
      throw missingPathError(normalizedDir);
    }

    if (options && options.withFileTypes) {
      return Array.from(entries.entries()).map(([name, isDir]) => ({
        name,
        isDirectory: () => isDir,
      })) as any;
    }

    return Array.from(entries.keys()) as any;
  });

  vi.mocked(fs.rm).mockImplementation(async (targetPath: any) => {
    const normalizedTarget = normalizePath(String(targetPath));
    const prefix = `${normalizedTarget}/`;
    for (const filePath of Array.from(virtualFiles.keys())) {
      if (filePath === normalizedTarget || filePath.startsWith(prefix)) {
        virtualFiles.delete(filePath);
      }
    }
  });
}

describe('Core Agent Storage with Mocks', () => {
  const worldId = 'test-world';

  beforeEach(async () => {
    // Setup environment for correct paths
    process.env.AGENT_WORLD_DATA_PATH = 'test-data/worlds';
    // Reset all mocks before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.AGENT_WORLD_DATA_PATH;
  });

  describe('listAgents', () => {
    test('should return empty array when no agents exist', async () => {
      // Mock empty directory
      vi.mocked(fs.readdir).mockResolvedValue([]);

      const loadedAgents = await listAgents('test-data/worlds', worldId);
      expect(loadedAgents).toEqual([]);
    });

    test('should load single agent correctly with mocked files', async () => {
      const agentId = 'test-agent-1';

      // Mock directory listing
      vi.mocked(fs.readdir).mockResolvedValue([{ name: agentId, isDirectory: () => true }] as any);

      // Mock agent files
      vi.mocked(fs.readFile).mockImplementation(async (path: string) => {
        if (path.includes('config.json')) {
          return JSON.stringify({
            id: agentId,
            name: 'Mock Agent',
            type: 'test',
            status: 'active',
            provider: 'openai',
            model: 'gpt-4',
            createdAt: '2023-01-01T00:00:00.000Z',
            lastActive: '2023-01-01T00:00:00.000Z',
            llmCallCount: 5,
            lastLLMCall: '2023-01-02T00:00:00.000Z'
          });
        }
        if (path.includes('system-prompt.md')) {
          return 'You are a mock agent for testing.';
        }
        if (path.includes('memory.json')) {
          return JSON.stringify([]);
        }
        throw new Error('File not found');
      });

      const loadedAgents = await listAgents('test-data/worlds', worldId);

      expect(loadedAgents).toHaveLength(1);
      expect(loadedAgents[0].id).toBe(agentId);
      expect(loadedAgents[0].name).toBe('Mock Agent');
      expect(loadedAgents[0].createdAt).toBeInstanceOf(Date);
    });

    test('should handle corrupted agent files gracefully with mocks', async () => {
      const agentId = 'corrupted-agent';

      // Mock directory listing
      vi.mocked(fs.readdir).mockResolvedValue([{ name: agentId, isDirectory: () => true }] as any);

      // Mock corrupted config file
      vi.mocked(fs.readFile).mockImplementation(async (path: string) => {
        if (path.includes('config.json')) {
          return '{ invalid json }';
        }
        throw new Error('File not found');
      });

      const loadedAgents = await listAgents('test-data/worlds', worldId);

      // Should skip corrupted agent and return empty array
      expect(loadedAgents).toEqual([]);
    });

    test('should preserve agent memory with Date objects using mocks', async () => {
      const agentId = 'memory-agent';

      // Mock directory listing
      vi.mocked(fs.readdir).mockResolvedValue([{ name: agentId, isDirectory: () => true }] as any);

      // Mock agent files with memory
      vi.mocked(fs.readFile).mockImplementation(async (path: string) => {
        if (path.includes('config.json')) {
          return JSON.stringify({
            id: agentId,
            name: 'Memory Agent',
            type: 'test',
            status: 'active',
            provider: 'openai',
            model: 'gpt-4',
            createdAt: '2023-01-01T00:00:00.000Z',
            lastActive: '2023-01-01T00:00:00.000Z',
            llmCallCount: 0
          });
        }
        if (path.includes('system-prompt.md')) {
          return 'You are a memory agent.';
        }
        if (path.includes('memory.json')) {
          return JSON.stringify([
            { role: 'user', content: 'Hello', createdAt: '2023-01-01T00:00:00.000Z', chatId: 'chat-1' },
            { role: 'assistant', content: 'Hi there!', createdAt: '2023-01-01T00:01:00.000Z', chatId: 'chat-1' },
            { role: 'user', content: 'Legacy message', createdAt: '2023-01-01T00:02:00.000Z' } // No chatId - legacy
          ]);
        }
        throw new Error('File not found');
      });

      const loadedAgents = await listAgents('test-data/worlds', worldId);

      expect(loadedAgents).toHaveLength(1);
      expect(loadedAgents[0].memory).toHaveLength(3);
      expect(loadedAgents[0].memory[0].createdAt).toBeInstanceOf(Date);
      expect(loadedAgents[0].memory[1].createdAt).toBeInstanceOf(Date);
      expect(loadedAgents[0].memory[0].chatId).toBe('chat-1');
      expect(loadedAgents[0].memory[1].chatId).toBe('chat-1');
      expect(loadedAgents[0].memory[2].chatId).toBeUndefined(); // Legacy message
    });
  });

  describe('loadAgent', () => {
    test('should return null for non-existent agent', async () => {
      // Mock file access failure
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const loadedAgent = await loadAgent('test-data/worlds', worldId, 'non-existent');
      expect(loadedAgent).toBeNull();
    });

    test('should load agent with all data correctly using mocks', async () => {
      const agentId = 'mock-agent';

      // Mock agent files
      vi.mocked(fs.readFile).mockImplementation(async (path: string) => {
        if (path.includes('config.json')) {
          return JSON.stringify({
            id: agentId,
            name: 'Mock Agent',
            type: 'test',
            status: 'active',
            provider: 'openai',
            model: 'gpt-4',
            createdAt: '2023-01-01T00:00:00.000Z',
            lastActive: '2023-01-01T00:00:00.000Z',
            llmCallCount: 5
          });
        }
        if (path.includes('system-prompt.md')) {
          return 'You are a mock agent for testing.';
        }
        if (path.includes('memory.json')) {
          return JSON.stringify([]);
        }
        throw new Error('File not found');
      });

      const loadedAgent = await loadAgent('test-data/worlds', worldId, agentId);

      expect(loadedAgent).not.toBeNull();
      expect(loadedAgent!.id).toBe('mock-agent');
      expect(loadedAgent!.name).toBe('Mock Agent');
      expect(loadedAgent!.llmCallCount).toBe(5);
    });
  });

  describe('saveAgent', () => {
    test('should create proper directory structure with mocks', async () => {
      const agentId = 'save-agent';
      const agent = createMockAgent({
        id: agentId,
        name: 'Test Agent',
        type: 'test',
        status: 'active',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4',
        systemPrompt: 'You are a test agent',
        createdAt: new Date(),
        lastActive: new Date(),
        llmCallCount: 0,
        memory: []
      });

      await saveAgent('test-data/worlds', worldId, agent);

      // Verify directory creation
      expect(vi.mocked(fs.mkdir)).toHaveBeenCalledWith(
        expect.stringContaining(agentId),
        { recursive: true }
      );

      // Verify files were written
      expect(vi.mocked(fs.writeFile)).toHaveBeenCalledTimes(3); // config, system-prompt, memory
    });

    test('should handle agents with complex memory using mocks', async () => {
      const agentId = 'complex-memory-agent';
      const agent = createMockAgent({
        id: agentId,
        name: 'Test Agent',
        type: 'test',
        status: 'active',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4',
        systemPrompt: 'You are a test agent',
        createdAt: new Date(),
        lastActive: new Date(),
        llmCallCount: 0,
        memory: [
          {
            role: 'user',
            content: 'Complex message with unicode: 你好 🌟',
            createdAt: new Date(),
            sender: 'test-user',
            chatId: 'chat-1'
          },
          {
            role: 'assistant',
            content: 'Response with special chars: @#$%^&*()',
            createdAt: new Date(),
            chatId: 'chat-1'
          }
        ]
      });

      // Should not throw and should save successfully
      await expect(saveAgent('test-data/worlds', worldId, agent)).resolves.toBeUndefined();

      // Verify files were written
      expect(vi.mocked(fs.writeFile)).toHaveBeenCalledTimes(3); // config, system-prompt, memory
    });

    test('should preserve chatId field when saving agents with mocks', async () => {
      const agentId = 'chatid-agent';
      const agent = createMockAgent({
        id: agentId,
        name: 'ChatId Test Agent',
        type: 'test',
        status: 'active',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4',
        systemPrompt: 'You are a test agent',
        createdAt: new Date(),
        lastActive: new Date(),
        llmCallCount: 0,
        memory: [
          {
            role: 'user',
            content: 'Message in chat 1',
            createdAt: new Date(),
            sender: 'user',
            chatId: 'chat-1'
          },
          {
            role: 'user',
            content: 'Message in chat 2',
            createdAt: new Date(),
            sender: 'user',
            chatId: 'chat-2'
          },
          {
            role: 'user',
            content: 'Legacy message with no chatId',
            createdAt: new Date(),
            sender: 'user'
            // No chatId field - legacy message
          }
        ]
      });

      await saveAgent('test-data/worlds', worldId, agent);

      // Verify memory file was written with chatId values
      const writeFileMock = vi.mocked(fs.writeFile);
      const memoryCallIndex = Array.from({ length: writeFileMock.mock.calls.length }, (_, i) => i)
        .find(i => writeFileMock.mock.calls[i][0].includes('memory.json'));

      expect(memoryCallIndex).toBeDefined();

      if (memoryCallIndex !== undefined) {
        const savedMemoryData = JSON.parse(writeFileMock.mock.calls[memoryCallIndex][1] as string);
        expect(savedMemoryData).toHaveLength(3);
        expect(savedMemoryData[0].chatId).toBe('chat-1');
        expect(savedMemoryData[1].chatId).toBe('chat-2');
        expect(savedMemoryData[2].chatId).toBeUndefined(); // Legacy message
      }
    });
  });

  describe('deleteAgent', () => {
    test('should return false for non-existent agent', async () => {
      // Mock access failure
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const result = await deleteAgent('test-data/worlds', worldId, 'non-existent');
      expect(result).toBe(false);
    });

    test('should delete agent and return true with mocks', async () => {
      const agentId = 'delete-agent';

      // Mock successful access
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const result = await deleteAgent('test-data/worlds', worldId, agentId);
      expect(result).toBe(true);

      // Verify deletion was called
      expect(vi.mocked(fs.rm)).toHaveBeenCalledWith(
        expect.stringContaining(agentId),
        { recursive: true, force: true }
      );
    });
  });

  describe('agentExists', () => {
    test('should return false for non-existent agent', async () => {
      // Mock access failure
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const exists = await agentExists('test-data/worlds', worldId, 'non-existent');
      expect(exists).toBe(false);
    });

    test('should return true for existing agent with mocks', async () => {
      const agentId = 'existing-agent';

      // Mock successful access
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const exists = await agentExists('test-data/worlds', worldId, agentId);
      expect(exists).toBe(true);

      // Verify access was called with config path
      expect(vi.mocked(fs.access)).toHaveBeenCalledWith(
        expect.stringContaining('config.json')
      );
    });
  });

  describe('Enhanced Error Scenarios', () => {
    test('should handle file read permission errors', async () => {
      const agentId = 'permission-test';

      // Mock directory listing
      vi.mocked(fs.readdir).mockResolvedValue([{ name: agentId, isDirectory: () => true }] as any);

      // Mock permission error for config file
      vi.mocked(fs.readFile).mockImplementation(async (path: string) => {
        if (path.includes('config.json')) {
          const error = new Error('EACCES: permission denied');
          (error as any).code = 'EACCES';
          throw error;
        }
        throw new Error('File not found');
      });

      const loadedAgents = await listAgents('test-data/worlds', worldId);
      expect(loadedAgents).toEqual([]);
    });

    test('should handle disk full errors during save', async () => {
      const agent = createMockAgent({
        id: 'save-error-test',
        name: 'Save Error Agent',
        type: 'test',
        status: 'active',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4',
        systemPrompt: 'Test agent',
        temperature: 0.7,
        maxTokens: 1000,
        createdAt: new Date('2023-01-01T00:00:00Z'),
        lastActive: new Date('2023-01-01T00:00:00Z'),
        llmCallCount: 0,
        memory: []
      });

      // Mock disk full error
      const diskError = new Error('ENOSPC: no space left on device');
      (diskError as any).code = 'ENOSPC';
      vi.mocked(fs.writeFile).mockRejectedValue(diskError);

      await expect(saveAgent('test-data/worlds', worldId, agent))
        .rejects.toThrow('ENOSPC: no space left on device');
    });
  });

  describe('Advanced Agent Storage Behaviors', () => {
    test('validates integrity and reports malformed config and memory', async () => {
      setupVirtualFs();

      const rootPath = 'test-data/worlds';
      const agentId = 'integrity-agent';
      const agentDir = `${rootPath}/${worldId}/agents/${agentId}`;
      seedVirtualFile(`${agentDir}/config.json`, JSON.stringify({ id: agentId, type: 'test', provider: 'openai' }));
      seedVirtualFile(`${agentDir}/system-prompt.md`, 'system');
      seedVirtualFile(`${agentDir}/memory.json`, '{not valid json}');

      const integrity = await validateAgentIntegrity(rootPath, worldId, agentId);
      expect(integrity.isValid).toBe(false);
      expect(integrity.hasConfig).toBe(true);
      expect(integrity.hasSystemPrompt).toBe(true);
      expect(integrity.hasMemory).toBe(true);
      expect(integrity.errors).toContain('Invalid config structure');
      expect(integrity.errors).toContain('Corrupted memory.json file');
    });

    test('repairs missing prompt and memory files when config exists', async () => {
      setupVirtualFs();

      const rootPath = 'test-data/worlds';
      const agentId = 'repair-agent';
      const agentDir = `${rootPath}/${worldId}/agents/${agentId}`;
      seedVirtualFile(
        `${agentDir}/config.json`,
        JSON.stringify({ id: agentId, type: 'assistant', provider: 'openai', model: 'gpt-4' }),
      );

      const repaired = await repairAgentData(rootPath, worldId, agentId);
      expect(repaired).toBe(true);
      expect(virtualFiles.has(normalizePath(`${agentDir}/system-prompt.md`))).toBe(true);
      expect(virtualFiles.has(normalizePath(`${agentDir}/memory.json`))).toBe(true);
    });

    test('saves config-only updates and saves memory with newline escaping behavior', async () => {
      setupVirtualFs();

      const rootPath = 'test-data/worlds';
      const agentId = 'config-agent';
      const agent = createMockAgent({
        id: agentId,
        name: 'Config Agent',
        type: 'assistant',
        status: 'active',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4',
        systemPrompt: 'Use config mode',
        createdAt: new Date('2026-02-27T00:00:00.000Z'),
        lastActive: new Date('2026-02-27T00:00:00.000Z'),
        llmCallCount: 0,
        memory: [],
      });

      await saveAgentConfig(rootPath, worldId, agent);
      expect(vi.mocked(fs.writeFile).mock.calls.filter((call) => String(call[0]).includes('memory.json'))).toHaveLength(0);

      await saveAgentMemory(rootPath, worldId, agentId, [
        {
          role: 'user',
          sender: 'tester',
          content: 'line-1\nline-2',
          createdAt: new Date('2026-02-27T00:01:00.000Z'),
          chatId: 'chat-1',
        } as any,
      ]);

      const memoryPath = normalizePath(`${rootPath}/${worldId}/agents/${agentId}/memory.json`);
      const memoryFile = virtualFiles.get(memoryPath);
      expect(memoryFile).toContain('\\n');
    });

    test('archives memory to timestamped file in archive directory', async () => {
      setupVirtualFs();
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-27T13:00:00.000Z'));

      const rootPath = 'test-data/worlds';
      const agentId = 'archive-agent';

      await archiveAgentMemory(rootPath, worldId, agentId, [
        {
          role: 'assistant',
          content: 'archived text',
          createdAt: new Date('2026-02-27T12:59:00.000Z'),
        } as any,
      ]);

      const archivePath = Array.from(virtualFiles.keys()).find((key) =>
        key.includes(`/agents/${agentId}/archive/memory-2026-02-27T13-00-00-000Z.json`),
      );
      expect(archivePath).toBeDefined();
      vi.useRealTimers();
    });

    test('retries load and supports partial-load fallback file creation', async () => {
      setupVirtualFs();

      const rootPath = 'test-data/worlds';
      const agentId = 'retry-agent';
      const agentDir = `${rootPath}/${worldId}/agents/${agentId}`;
      seedVirtualFile(
        `${agentDir}/config.json`,
        JSON.stringify({
          id: agentId,
          name: 'Retry Agent',
          type: 'assistant',
          provider: 'openai',
          model: 'gpt-4',
          createdAt: '2026-02-27T00:00:00.000Z',
          lastActive: '2026-02-27T00:00:00.000Z',
        }),
      );
      seedVirtualFile(`${agentDir}/memory.json`, JSON.stringify([]));

      let failFirstConfigRead = true;
      const baseReadImpl = vi.mocked(fs.readFile).getMockImplementation()!;
      vi.mocked(fs.readFile).mockImplementation(async (filePath: any) => {
        const target = normalizePath(String(filePath));
        if (target.endsWith('/config.json') && failFirstConfigRead) {
          failFirstConfigRead = false;
          throw new Error('Transient read failure');
        }
        return baseReadImpl(filePath);
      });

      const retried = await loadAgentWithRetry(rootPath, worldId, agentId, {
        retryCount: 1,
        retryDelay: 0,
      });
      expect(retried?.id).toBe(agentId);
      expect(retried?.memory).toEqual([]);

      const partialAgentId = 'partial-agent';
      const partialDir = `${rootPath}/${worldId}/agents/${partialAgentId}`;
      seedVirtualFile(
        `${partialDir}/config.json`,
        JSON.stringify({
          id: partialAgentId,
          name: 'Partial Agent',
          type: 'assistant',
          provider: 'openai',
          model: 'gpt-4',
        }),
      );

      const partial = await loadAgentWithRetry(rootPath, worldId, partialAgentId, {
        allowPartialLoad: true,
        includeMemory: true,
        retryCount: 0,
      });
      expect(partial?.systemPrompt).toContain(`You are ${partialAgentId}`);
      expect(virtualFiles.has(normalizePath(`${partialDir}/system-prompt.md`))).toBe(true);
      expect(virtualFiles.has(normalizePath(`${partialDir}/memory.json`))).toBe(true);
    });

    test('loads agents in batch and deletes chat-scoped memory across agents', async () => {
      setupVirtualFs();

      const rootPath = 'test-data/worlds';
      const agentA = `${rootPath}/${worldId}/agents/agent-a`;
      const agentB = `${rootPath}/${worldId}/agents/agent-b`;
      const broken = `${rootPath}/${worldId}/agents/broken`;

      seedVirtualFile(
        `${agentA}/config.json`,
        JSON.stringify({ id: 'agent-a', name: 'Agent A', type: 'assistant', provider: 'openai', model: 'gpt-4' }),
      );
      seedVirtualFile(`${agentA}/system-prompt.md`, 'A');
      seedVirtualFile(
        `${agentA}/memory.json`,
        JSON.stringify([
          { role: 'user', content: 'chat1', createdAt: '2026-02-27T00:00:00.000Z', chatId: 'chat-1' },
          { role: 'assistant', content: 'chat2', createdAt: '2026-02-27T00:01:00.000Z', chatId: 'chat-2' },
        ]),
      );

      seedVirtualFile(
        `${agentB}/config.json`,
        JSON.stringify({ id: 'agent-b', name: 'Agent B', type: 'assistant', provider: 'openai', model: 'gpt-4' }),
      );
      seedVirtualFile(`${agentB}/system-prompt.md`, 'B');
      seedVirtualFile(
        `${agentB}/memory.json`,
        JSON.stringify([
          { role: 'user', content: 'chat1-b', createdAt: '2026-02-27T00:02:00.000Z', chatId: 'chat-1' },
        ]),
      );

      seedVirtualFile(`${broken}/config.json`, '{invalid');

      const batch = await loadAgentsBatch(rootPath, worldId, { retryCount: 0 });
      expect(batch.totalCount).toBe(3);
      expect(batch.successCount).toBe(2);
      expect(batch.failureCount).toBe(1);

      const deletedCount = await deleteMemoryByChatId(rootPath, worldId, 'chat-1');
      expect(deletedCount).toBe(2);

      const updatedMemoryA = JSON.parse(virtualFiles.get(normalizePath(`${agentA}/memory.json`)) || '[]');
      const updatedMemoryB = JSON.parse(virtualFiles.get(normalizePath(`${agentB}/memory.json`)) || '[]');
      expect(updatedMemoryA).toHaveLength(1);
      expect(updatedMemoryA[0].chatId).toBe('chat-2');
      expect(updatedMemoryB).toHaveLength(0);
    });
  });
});

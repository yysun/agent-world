/**
 * Mock Infrastructure for Core System Tests
 * 
 * Features:
 * - File I/O mocking with in-memory filesystem
 * - LLM provider mocking with configurable responses
 * - Environment variable management
 * - Test isolation and cleanup utilities
 * 
 * Implementation:
 * - Uses jest.mock for module mocking
 * - In-memory file system simulation
 * - Configurable LLM response patterns
 * - Automatic cleanup between tests
 */

import { jest } from '@jest/globals';
import { Agent, AgentMessage, LLMProvider, CreateAgentParams } from '../../core/types.js';
import { CreateWorldParams } from '../../core/world-manager.js';

// Mock file system state
interface MockFileSystem {
  [path: string]: string | MockFileSystem;
}

let mockFileSystem: MockFileSystem = {};
let mockLLMResponses: Map<string, string[]> = new Map();
let mockLLMCallCount = 0;

/**
 * Reset all mocks to initial state
 */
export function resetAllMocks(): void {
  mockFileSystem = {};
  mockLLMResponses.clear();
  mockLLMCallCount = 0;
  jest.clearAllMocks();
}

/**
 * Mock file system operations
 */
export const mockFs = {
  promises: {
    readFile: jest.fn<(path: string, encoding?: string) => Promise<string>>(),
    writeFile: jest.fn<(path: string, data: string, encoding?: string) => Promise<void>>(),
    mkdir: jest.fn<(path: string, options?: any) => Promise<void>>(),
    rm: jest.fn<(path: string, options?: any) => Promise<void>>(),
    access: jest.fn<(path: string) => Promise<void>>(),
    readdir: jest.fn<(path: string, options?: any) => Promise<any[]>>(),
    rename: jest.fn<(oldPath: string, newPath: string) => Promise<void>>(),
    unlink: jest.fn<(path: string) => Promise<void>>()
  }
};

/**
 * Setup file system mocking
 */
export function setupFileSystemMocks(): void {
  // Mock successful file operations by default
  mockFs.promises.readFile.mockImplementation(async (path: string) => {
    const content = getFileContent(path);
    if (content === undefined) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }
    return content;
  });

  mockFs.promises.writeFile.mockImplementation(async (path: string, data: string) => {
    setFileContent(path, data);
  });

  mockFs.promises.mkdir.mockImplementation(async () => {
    // Always succeed for mkdir
  });

  mockFs.promises.rm.mockImplementation(async (path: string) => {
    removeFile(path);
  });

  mockFs.promises.access.mockImplementation(async (path: string) => {
    if (!fileExists(path)) {
      throw new Error(`ENOENT: no such file or directory, access '${path}'`);
    }
  });

  mockFs.promises.readdir.mockImplementation(async (path: string) => {
    return getDirectoryContents(path);
  });

  mockFs.promises.rename.mockImplementation(async (oldPath: string, newPath: string) => {
    const content = getFileContent(oldPath);
    if (content !== undefined) {
      setFileContent(newPath, content);
      removeFile(oldPath);
    }
  });

  mockFs.promises.unlink.mockImplementation(async (path: string) => {
    removeFile(path);
  });
}

/**
 * File system utility functions
 */
function getFileContent(path: string): string | undefined {
  const parts = path.split('/').filter(p => p.length > 0);
  let current: MockFileSystem | string = mockFileSystem;

  for (const part of parts) {
    if (typeof current === 'string') return undefined;
    current = current[part];
    if (current === undefined) return undefined;
  }

  return typeof current === 'string' ? current : undefined;
}

function setFileContent(path: string, content: string): void {
  const parts = path.split('/').filter(p => p.length > 0);
  let current = mockFileSystem;

  // Create directory structure
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part] as MockFileSystem;
  }

  // Set file content
  current[parts[parts.length - 1]] = content;
}

function removeFile(path: string): void {
  const parts = path.split('/').filter(p => p.length > 0);
  let current = mockFileSystem;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (typeof current[part] !== 'object') return;
    current = current[part] as MockFileSystem;
  }

  delete current[parts[parts.length - 1]];
}

function fileExists(path: string): boolean {
  return getFileContent(path) !== undefined;
}

function getDirectoryContents(path: string): any[] {
  const parts = path.split('/').filter(p => p.length > 0);
  let current: MockFileSystem | string = mockFileSystem;

  for (const part of parts) {
    if (typeof current === 'string') return [];
    current = current[part];
    if (current === undefined) return [];
  }

  if (typeof current === 'string') return [];

  return Object.keys(current).map(name => ({
    name,
    isDirectory: () => typeof current[name] === 'object'
  }));
}

/**
 * LLM mocking functions
 */
export function setupLLMMocks(): void {
  // Mock LLM calls to return predefined responses
  mockLLMResponses.set('default', [
    'This is a mock LLM response.',
    'Another mock response.',
    'Yet another mock response.'
  ]);
}

export function setMockLLMResponse(key: string, responses: string[]): void {
  mockLLMResponses.set(key, responses);
}

export function getMockLLMResponse(key: string = 'default'): string {
  const responses = mockLLMResponses.get(key) || ['Mock LLM response'];
  const response = responses[mockLLMCallCount % responses.length];
  mockLLMCallCount++;
  return response;
}

export function getLLMCallCount(): number {
  return mockLLMCallCount;
}

/**
 * Test data creation utilities
 */
export function createMockAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'mock-agent',
    name: 'Mock Agent',
    type: 'test',
    status: 'active',
    provider: LLMProvider.OPENAI,
    model: 'gpt-4',
    systemPrompt: 'You are a mock agent for testing.',
    temperature: 0.7,
    maxTokens: 1000,
    createdAt: new Date('2023-01-01T00:00:00Z'),
    lastActive: new Date('2023-01-01T00:00:00Z'),
    llmCallCount: 0,
    memory: [],
    ...overrides
  };
}

export function createMockAgentMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    role: 'user',
    content: 'Mock message content',
    createdAt: new Date('2023-01-01T00:00:00Z'),
    sender: 'test-user',
    ...overrides
  };
}

export function createMockWorldConfig(overrides: Partial<CreateWorldParams> = {}): CreateWorldParams {
  return {
    name: 'mock-world',
    description: 'Mock world for testing',
    turnLimit: 5,
    ...overrides
  };
}

export function createMockAgentConfig(overrides: Partial<CreateAgentParams> = {}): CreateAgentParams {
  return {
    id: 'mock-agent',
    name: 'Mock Agent',
    type: 'test',
    provider: LLMProvider.OPENAI,
    model: 'gpt-4',
    systemPrompt: 'You are a mock agent for testing.',
    temperature: 0.7,
    maxTokens: 1000,
    ...overrides
  };
}

/**
 * Mock file structure creation
 */
export function createMockWorldStructure(worldId: string): void {
  // Create world config
  const worldConfig = {
    name: worldId,
    description: 'Mock world',
    turnLimit: 5
  };

  setFileContent(`test-data/worlds/${worldId}/config.json`, JSON.stringify(worldConfig, null, 2));
}

export function createMockAgentStructure(worldId: string, agentId: string, agent?: Partial<Agent>): void {
  const mockAgent = createMockAgent({ id: agentId, ...agent });

  // Create agent directory structure
  const basePath = `test-data/worlds/${worldId}/agents/${agentId}`;

  // Config file (without systemPrompt)
  const { systemPrompt, ...agentWithoutPrompt } = mockAgent;
  const configData = {
    ...agentWithoutPrompt,
    createdAt: mockAgent.createdAt?.toISOString(),
    lastActive: mockAgent.lastActive?.toISOString(),
    lastLLMCall: mockAgent.lastLLMCall?.toISOString()
  };

  setFileContent(`${basePath}/config.json`, JSON.stringify(configData, null, 2));

  // System prompt file
  setFileContent(`${basePath}/system-prompt.md`, systemPrompt || `You are ${agentId}, an AI agent.`);

  // Memory file
  setFileContent(`${basePath}/memory.json`, JSON.stringify(mockAgent.memory || [], null, 2));
}

export function createMockCorruptedAgent(worldId: string, agentId: string): void {
  const basePath = `test-data/worlds/${worldId}/agents/${agentId}`;

  // Create corrupted config file
  setFileContent(`${basePath}/config.json`, '{ invalid json content }');

  // Create empty or missing other files
  setFileContent(`${basePath}/system-prompt.md`, '');
  setFileContent(`${basePath}/memory.json`, 'invalid json');
}

/**
 * Environment setup utilities
 */
export function setupMockEnvironment(): void {
  process.env.AGENT_WORLD_DATA_PATH = 'test-data/worlds';
  process.env.NODE_ENV = 'test';
}

export function cleanupMockEnvironment(): void {
  delete process.env.AGENT_WORLD_DATA_PATH;
  delete process.env.AGENT_WORLD_ID;
  delete process.env.NODE_ENV;
}

/**
 * Assertion helpers for mocked functions
 */
export function expectFileRead(path: string, times: number = 1): void {
  expect(mockFs.promises.readFile).toHaveBeenCalledWith(path, 'utf8');
  if (times > 0) {
    expect(mockFs.promises.readFile).toHaveBeenCalledTimes(times);
  }
}

export function expectFileWrite(path: string, content?: string, times: number = 1): void {
  if (content) {
    expect(mockFs.promises.writeFile).toHaveBeenCalledWith(path, content, 'utf8');
  } else {
    expect(mockFs.promises.writeFile).toHaveBeenCalledWith(path, expect.any(String), 'utf8');
  }

  if (times > 0) {
    expect(mockFs.promises.writeFile).toHaveBeenCalledTimes(times);
  }
}

export function expectDirectoryCreated(path: string, times: number = 1): void {
  expect(mockFs.promises.mkdir).toHaveBeenCalledWith(path, { recursive: true });
  if (times > 0) {
    expect(mockFs.promises.mkdir).toHaveBeenCalledTimes(times);
  }
}

export function expectFileDeleted(path: string, times: number = 1): void {
  expect(mockFs.promises.rm).toHaveBeenCalledWith(path, { recursive: true, force: true });
  if (times > 0) {
    expect(mockFs.promises.rm).toHaveBeenCalledTimes(times);
  }
}

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
 * - Uses vi.mock for module mocking
 * - In-memory file system simulation
 * - Configurable LLM response patterns
 * - Automatic cleanup between tests
 */

import { vi } from 'vitest';
import { Agent, AgentMessage, LLMProvider, CreateAgentParams, CreateWorldParams } from '../../core/types.js';

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
  vi.clearAllMocks();
}

/**
 * Mock file system operations
 */
export const mockFs = {
  promises: {
    readFile: vi.fn<(path: string, encoding?: string) => Promise<string>>(),
    writeFile: vi.fn<(path: string, data: string, encoding?: string) => Promise<void>>(),
    mkdir: vi.fn<(path: string, options?: any) => Promise<void>>(),
    rm: vi.fn<(path: string, options?: any) => Promise<void>>(),
    access: vi.fn<(path: string) => Promise<void>>(),
    readdir: vi.fn<(path: string, options?: any) => Promise<any[]>>(),
    rename: vi.fn<(oldPath: string, newPath: string) => Promise<void>>(),
    unlink: vi.fn<(path: string) => Promise<void>>()
  }
};

/**
 * Enhanced storage mocking for new API surfaces
 * Includes chat history, snapshot operations, and integrity checks
 */
export const mockStorage = {
  // World operations
  saveWorld: vi.fn<any>().mockResolvedValue(undefined),
  loadWorld: vi.fn<any>().mockResolvedValue({}),
  deleteWorld: vi.fn<any>().mockResolvedValue(true),
  listWorlds: vi.fn<any>().mockResolvedValue([]),

  // Agent operations  
  saveAgent: vi.fn<any>().mockResolvedValue(undefined),
  loadAgent: vi.fn<any>().mockResolvedValue(null),
  deleteAgent: vi.fn<any>().mockResolvedValue(true),
  listAgents: vi.fn<any>().mockResolvedValue([]),

  // Batch operations
  saveAgentsBatch: vi.fn<any>().mockResolvedValue(undefined),
  loadAgentsBatch: vi.fn<any>().mockResolvedValue([]),

  // Chat history operations - new mock surfaces
  saveChat: vi.fn<any>().mockResolvedValue(undefined),
  loadChat: vi.fn<any>().mockResolvedValue(null),
  deleteChat: vi.fn<any>().mockResolvedValue(true),
  listChats: vi.fn<any>().mockResolvedValue([]),
  updateChat: vi.fn<any>().mockResolvedValue(null),

  // Snapshot operations - new mock surfaces
  saveSnapshot: vi.fn<any>().mockResolvedValue(undefined),
  loadSnapshot: vi.fn<any>().mockResolvedValue(null),
  restoreFromSnapshot: vi.fn<any>().mockResolvedValue(true),

  // Integrity operations - new mock surfaces
  validateIntegrity: vi.fn<any>().mockResolvedValue(true),
  repairData: vi.fn<any>().mockResolvedValue(true),
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
 * Enhanced error scenario helpers for file operations
 */
export function setupFileSystemErrorScenarios(): void {
  // Setup various error scenarios for testing
  mockLLMResponses.set('file-errors', ['ENOENT', 'EACCES', 'EMFILE', 'ENOSPC']);
}

export function simulateFileSystemError(errorType: string = 'ENOENT'): void {
  const error = new Error(`${errorType}: file system error`);
  (error as any).code = errorType;

  // Make next file operation fail with this error
  mockFs.promises.readFile.mockRejectedValueOnce(error);
}

/**
 * Enhanced LLM streaming simulation
 */
export function setupStreamingLLMMocks(): void {
  // Mock streaming responses with configurable chunks
  mockLLMResponses.set('streaming', [
    'Chunk 1: Hello ',
    'Chunk 2: from ',
    'Chunk 3: streaming ',
    'Chunk 4: LLM!'
  ]);
}

export function createMockStreamResponse(chunks: string[]): AsyncGenerator<string> {
  return (async function* () {
    for (const chunk of chunks) {
      yield chunk;
    }
  })();
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

/**
 * Mock cleanup verification utilities
 */
export function verifyMockCleanup(): boolean {
  // Verify all mocks are properly reset
  return mockLLMCallCount === 0 && mockLLMResponses.size === 0;
}

export function getMockFileSystemState(): Record<string, string> {
  // Return current mock file system state for debugging
  const flatState: Record<string, string> = {};
  const flatten = (obj: any, prefix = '') => {
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}/${key}` : key;
      if (typeof value === 'string') {
        flatState[path] = value;
      } else if (typeof value === 'object') {
        flatten(value, path);
      }
    }
  };
  flatten(mockFileSystem);
  return flatState;
}

/**
 * Complex conversation history builders
 */
export function createComplexConversationHistory(scenarioType: 'multi-agent' | 'turn-heavy' | 'mention-heavy' = 'multi-agent'): AgentMessage[] {
  const baseTime = new Date('2023-01-01T00:00:00Z');

  switch (scenarioType) {
    case 'multi-agent':
      return [
        createMockAgentMessage({
          role: 'user',
          content: 'Hello @alice, can you help @bob with the project?',
          sender: 'user',
          createdAt: new Date(baseTime.getTime() + 1000)
        }),
        createMockAgentMessage({
          role: 'assistant',
          content: 'Of course! @bob, I\'d be happy to help. What do you need assistance with?',
          sender: 'alice',
          createdAt: new Date(baseTime.getTime() + 2000)
        }),
        createMockAgentMessage({
          role: 'assistant',
          content: '@alice Thanks! I need help with the data analysis. Can you review my approach?',
          sender: 'bob',
          createdAt: new Date(baseTime.getTime() + 3000)
        }),
        createMockAgentMessage({
          role: 'assistant',
          content: '@bob Your approach looks good, but consider using a different algorithm for better performance.',
          sender: 'alice',
          createdAt: new Date(baseTime.getTime() + 4000)
        }),
        createMockAgentMessage({
          role: 'user',
          content: 'Great collaboration, everyone!',
          sender: 'user',
          createdAt: new Date(baseTime.getTime() + 5000)
        })
      ];

    case 'turn-heavy':
      return Array.from({ length: 15 }, (_, i) =>
        createMockAgentMessage({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Turn ${i + 1}: This is message number ${i + 1} in a long conversation.`,
          sender: i % 2 === 0 ? 'user' : 'agent',
          createdAt: new Date(baseTime.getTime() + (i + 1) * 1000)
        })
      );

    case 'mention-heavy':
      return [
        createMockAgentMessage({
          role: 'user',
          content: '@alice @bob @charlie @diana all need to coordinate on this task.',
          sender: 'user',
          createdAt: new Date(baseTime.getTime() + 1000)
        }),
        createMockAgentMessage({
          role: 'assistant',
          content: '@bob @charlie @diana I can coordinate this. Let\'s start with phase 1.',
          sender: 'alice',
          createdAt: new Date(baseTime.getTime() + 2000)
        }),
        createMockAgentMessage({
          role: 'assistant',
          content: '@alice @charlie @diana Sounds good. I\'ll handle the initial setup.',
          sender: 'bob',
          createdAt: new Date(baseTime.getTime() + 3000)
        })
      ];

    default:
      return [createMockAgentMessage()];
  }
}

/**
 * Event-heavy test scenarios
 */
export interface MockEventScenario {
  name: string;
  events: Array<{
    type: 'message' | 'agent_join' | 'agent_leave' | 'turn_limit' | 'error';
    timestamp: Date;
    data: any;
  }>;
}

export function createEventHeavyScenario(scenarioType: 'rapid-fire' | 'concurrent' | 'error-prone' = 'rapid-fire'): MockEventScenario {
  const baseTime = new Date('2023-01-01T00:00:00Z');

  switch (scenarioType) {
    case 'rapid-fire':
      return {
        name: 'Rapid Fire Events',
        events: Array.from({ length: 20 }, (_, i) => ({
          type: 'message' as const,
          timestamp: new Date(baseTime.getTime() + i * 100), // 100ms intervals
          data: {
            content: `Rapid message ${i + 1}`,
            sender: i % 3 === 0 ? 'user' : `agent${i % 2 + 1}`
          }
        }))
      };

    case 'concurrent':
      return {
        name: 'Concurrent Agent Operations',
        events: [
          {
            type: 'agent_join',
            timestamp: new Date(baseTime.getTime() + 100),
            data: { agentId: 'alice', worldId: 'test-world' }
          },
          {
            type: 'agent_join',
            timestamp: new Date(baseTime.getTime() + 150),
            data: { agentId: 'bob', worldId: 'test-world' }
          },
          {
            type: 'message',
            timestamp: new Date(baseTime.getTime() + 200),
            data: { content: 'Hello @alice @bob', sender: 'user' }
          },
          {
            type: 'message',
            timestamp: new Date(baseTime.getTime() + 250),
            data: { content: 'Hi there!', sender: 'alice' }
          },
          {
            type: 'message',
            timestamp: new Date(baseTime.getTime() + 300),
            data: { content: 'Hello everyone!', sender: 'bob' }
          },
          {
            type: 'turn_limit',
            timestamp: new Date(baseTime.getTime() + 400),
            data: { agentId: 'alice', turnCount: 5 }
          }
        ]
      };

    case 'error-prone':
      return {
        name: 'Error-Prone Scenario',
        events: [
          {
            type: 'message',
            timestamp: new Date(baseTime.getTime() + 100),
            data: { content: 'Test message', sender: 'user' }
          },
          {
            type: 'error',
            timestamp: new Date(baseTime.getTime() + 200),
            data: { type: 'LLM_TIMEOUT', message: 'LLM response timeout' }
          },
          {
            type: 'message',
            timestamp: new Date(baseTime.getTime() + 300),
            data: { content: 'Retry message', sender: 'user' }
          },
          {
            type: 'error',
            timestamp: new Date(baseTime.getTime() + 400),
            data: { type: 'FILE_IO_ERROR', message: 'Failed to save agent memory' }
          }
        ]
      };

    default:
      return {
        name: 'Simple Scenario',
        events: [{
          type: 'message',
          timestamp: baseTime,
          data: { content: 'Test', sender: 'user' }
        }]
      };
  }
}

/**
 * Edge case agent configurations
 */
export function createEdgeCaseAgentConfig(edgeCase: 'minimal' | 'maximal' | 'invalid' | 'corrupted' = 'minimal'): Partial<Agent> {
  const baseTime = new Date('2023-01-01T00:00:00Z');

  switch (edgeCase) {
    case 'minimal':
      return {
        id: 'min',
        name: 'Min',
        type: 'minimal',
        status: 'active',
        provider: LLMProvider.OPENAI,
        model: 'gpt-3.5-turbo',
        systemPrompt: 'Hi.',
        temperature: 0,
        maxTokens: 1,
        createdAt: baseTime,
        lastActive: baseTime,
        llmCallCount: 0,
        memory: []
      };

    case 'maximal':
      return {
        id: 'max-agent-with-very-long-identifier-that-tests-system-limits',
        name: 'Maximum Configuration Agent with Extended Properties',
        type: 'maximal-test-agent-type',
        status: 'active',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4-turbo-preview',
        systemPrompt: 'You are an extremely sophisticated AI agent with extensive capabilities. '.repeat(50), // Long prompt
        temperature: 1.0,
        maxTokens: 4096,
        createdAt: baseTime,
        lastActive: baseTime,
        llmCallCount: 999,
        memory: createComplexConversationHistory('turn-heavy')
      };

    case 'invalid':
      return {
        id: '', // Invalid empty ID
        name: '',
        type: '',
        status: 'unknown' as any,
        provider: 'INVALID_PROVIDER' as any,
        model: '',
        systemPrompt: '',
        temperature: -1, // Invalid temperature
        maxTokens: -100, // Invalid max tokens
        createdAt: new Date('invalid'), // Invalid date
        lastActive: new Date('invalid'),
        llmCallCount: -1,
        memory: null as any // Invalid memory
      };

    case 'corrupted':
      return {
        id: 'corrupted\x00agent', // Null character
        name: 'Corrupted\nAgent\tName', // Special characters
        type: '../../path/traversal',
        status: 'active',
        provider: LLMProvider.OPENAI,
        model: 'model"with"quotes',
        systemPrompt: 'System prompt with \u0000 null bytes and 🦄 emojis',
        temperature: NaN,
        maxTokens: Infinity,
        createdAt: baseTime,
        lastActive: baseTime,
        llmCallCount: 0,
        memory: [
          {
            role: 'user',
            content: 'Message with \x00 null bytes',
            createdAt: baseTime,
            sender: 'corrupted\nuser'
          } as any
        ]
      };

    default:
      return createMockAgent();
  }
}

/**
 * SSE event test patterns
 */
export interface MockSSEEvent {
  type: string;
  data: string;
  id?: string;
  retry?: number;
}

export function createSSEEventPattern(pattern: 'streaming' | 'error' | 'mixed' = 'streaming'): MockSSEEvent[] {
  switch (pattern) {
    case 'streaming':
      return [
        { type: 'llm-start', data: JSON.stringify({ agentId: 'test-agent', messageId: 'msg-1' }) },
        { type: 'llm-chunk', data: JSON.stringify({ chunk: 'Hello ', partial: 'Hello ' }), id: '1' },
        { type: 'llm-chunk', data: JSON.stringify({ chunk: 'world', partial: 'Hello world' }), id: '2' },
        { type: 'llm-chunk', data: JSON.stringify({ chunk: '!', partial: 'Hello world!' }), id: '3' },
        {
          type: 'llm-complete', data: JSON.stringify({
            finalResponse: 'Hello world!',
            tokenCount: 3,
            duration: 1500
          }), id: '4'
        }
      ];

    case 'error':
      return [
        { type: 'llm-start', data: JSON.stringify({ agentId: 'test-agent', messageId: 'msg-1' }) },
        { type: 'llm-chunk', data: JSON.stringify({ chunk: 'Starting...', partial: 'Starting...' }), id: '1' },
        {
          type: 'llm-error', data: JSON.stringify({
            error: 'Rate limit exceeded',
            code: 'RATE_LIMIT',
            retryAfter: 60
          }), id: '2'
        }
      ];

    case 'mixed':
      return [
        { type: 'llm-start', data: JSON.stringify({ agentId: 'agent1', messageId: 'msg-1' }) },
        { type: 'llm-chunk', data: JSON.stringify({ chunk: 'Agent 1: ', partial: 'Agent 1: ' }), id: '1' },
        { type: 'llm-start', data: JSON.stringify({ agentId: 'agent2', messageId: 'msg-2' }) },
        { type: 'llm-chunk', data: JSON.stringify({ chunk: 'Hello', partial: 'Agent 1: Hello' }), id: '2' },
        { type: 'llm-chunk', data: JSON.stringify({ chunk: 'Agent 2: ', partial: 'Agent 2: ' }), id: '3' },
        {
          type: 'llm-complete', data: JSON.stringify({
            finalResponse: 'Agent 1: Hello',
            agentId: 'agent1'
          }), id: '4'
        },
        { type: 'llm-chunk', data: JSON.stringify({ chunk: 'Hi!', partial: 'Agent 2: Hi!' }), id: '5' },
        {
          type: 'llm-complete', data: JSON.stringify({
            finalResponse: 'Agent 2: Hi!',
            agentId: 'agent2'
          }), id: '6'
        }
      ];

    default:
      return [
        { type: 'test-event', data: JSON.stringify({ message: 'test' }) }
      ];
  }
}

/**
 * Comprehensive mock data builder
 */
export function createComprehensiveTestScenario(name: string = 'default'): {
  world: CreateWorldParams;
  agents: Agent[];
  messages: AgentMessage[];
  events: MockEventScenario;
  sseEvents: MockSSEEvent[];
} {
  return {
    world: createMockWorldConfig({ name: `${name}-world`, description: `Test world for ${name}` }),
    agents: [
      createMockAgent({ id: 'alice', name: 'Alice', type: 'helper' }),
      createMockAgent({ id: 'bob', name: 'Bob', type: 'analyst' }),
      createMockAgent(createEdgeCaseAgentConfig('minimal'))
    ],
    messages: createComplexConversationHistory('multi-agent'),
    events: createEventHeavyScenario('concurrent'),
    sseEvents: createSSEEventPattern('mixed')
  };
}

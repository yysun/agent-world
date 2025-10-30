/**
 * Comprehensive Mock Setup for Test Reorganization
 * 
 * Ensures all file I/O and LLM calls are properly mocked during test reorganization.
 * This file provides centralized mock configuration that will work across all 
 * reorganized test files regardless of their directory structure.
 * 
 * Updated to use direct SDK mocks (OpenAI, Anthropic, Google) instead of AI SDK.
 */

import { vi } from 'vitest';

/**
 * Global File I/O Mocking
 * Prevents any actual disk operations during tests
 */
export function setupFileSystemMocks(): void {
  // Mock the core fs module (not fs/promises)
  vi.mock('fs', () => ({
    promises: {
      readFile: vi.fn<any>().mockResolvedValue('{}'),
      writeFile: vi.fn<any>().mockResolvedValue(undefined),
      mkdir: vi.fn<any>().mockResolvedValue(undefined),
      rm: vi.fn<any>().mockResolvedValue(undefined),
      access: vi.fn<any>().mockResolvedValue(undefined),
      readdir: vi.fn<any>().mockResolvedValue([]),
      rename: vi.fn<any>().mockResolvedValue(undefined),
      unlink: vi.fn<any>().mockResolvedValue(undefined),
      stat: vi.fn<any>().mockResolvedValue({ isDirectory: () => false, isFile: () => true }),
      lstat: vi.fn<any>().mockResolvedValue({ isDirectory: () => false, isFile: () => true })
    },
    // Also mock synchronous versions that might be used
    readFileSync: vi.fn<any>().mockReturnValue('{}'),
    writeFileSync: vi.fn<any>().mockReturnValue(undefined),
    existsSync: vi.fn<any>().mockReturnValue(true),
    mkdirSync: vi.fn<any>().mockReturnValue(undefined),
    readdirSync: vi.fn<any>().mockReturnValue([])
  }));
}

/**
 * Global Agent Storage Mocking
 * Prevents disk operations from agent storage module
 */
export function setupAgentStorageMocks(): void {
  // Mock all agent storage functions with flexible import paths
  const mockStorageFunctions = {
    saveAgentMemoryToDisk: vi.fn<any>().mockResolvedValue(undefined),
    saveAgentConfigToDisk: vi.fn<any>().mockResolvedValue(undefined),
    saveAgentToDisk: vi.fn<any>().mockResolvedValue(undefined),
    loadAgentMemoryFromDisk: vi.fn<any>().mockResolvedValue([]),
    loadAgentConfigFromDisk: vi.fn<any>().mockResolvedValue({}),
    loadAgentFromDisk: vi.fn<any>().mockResolvedValue(null),
    loadAllAgentsFromDisk: vi.fn<any>().mockResolvedValue([]),
    deleteAgentFromDisk: vi.fn<any>().mockResolvedValue(true),
    agentExistsOnDisk: vi.fn<any>().mockResolvedValue(true),
    saveWorldToDisk: vi.fn<any>().mockResolvedValue(undefined),
    loadWorldFromDisk: vi.fn<any>().mockResolvedValue({})
  };

  // Mock all possible import paths that tests might use
  const agentStoragePaths = [
    '../../../core/agent-storage',
    '../../../core/world-storage'
  ];

  agentStoragePaths.forEach(path => {
    vi.mock(path, () => mockStorageFunctions);
  });
}

/**
 * Global LLM Manager Mocking
 * Prevents actual LLM API calls during tests and mocks direct integration routing
 */
export function setupLLMManagerMocks(): void {
  const mockLLMFunctions = {
    streamAgentResponse: vi.fn<any>().mockResolvedValue('Mock direct integration streaming response'),
    generateAgentResponse: vi.fn<any>().mockResolvedValue('Mock direct integration response'),
    getLLMQueueStatus: vi.fn<any>().mockReturnValue({
      queueSize: 0,
      isProcessing: false,
      completedCalls: 0,
      failedCalls: 0
    }),
    clearLLMQueue: vi.fn<any>().mockResolvedValue(undefined),
    // Provider helper functions for testing (updated for direct integrations)
    isOpenAIProvider: vi.fn<any>().mockImplementation((provider: string) =>
      ['openai', 'azure', 'xai', 'openai-compatible', 'ollama'].includes(provider?.toLowerCase())
    ),
    isAnthropicProvider: vi.fn<any>().mockImplementation((provider: string) =>
      provider?.toLowerCase() === 'anthropic'
    ),
    isGoogleProvider: vi.fn<any>().mockImplementation((provider: string) =>
      provider?.toLowerCase() === 'google'
    )
  };

  // Mock all possible import paths for LLM manager
  const llmManagerPaths = [
    '../../../core/llm-manager',
    '../../../core/llm-config'
  ];

  llmManagerPaths.forEach(path => {
    vi.mock(path, () => mockLLMFunctions);
  });
}

/**
 * External Direct SDK Mocking
 * Mocks direct SDK libraries (OpenAI, Anthropic, Google) that are now used instead of AI SDK
 */
export function setupDirectSDKMocks(): void {
  // Mock OpenAI SDK
  vi.mock('openai', () => ({
    default: vi.fn<any>().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn<any>().mockResolvedValue({
            choices: [{ message: { content: 'Mock OpenAI response', tool_calls: [] } }]
          })
        }
      }
    }))
  }));

  // Mock Anthropic SDK
  vi.mock('@anthropic-ai/sdk', () => ({
    default: vi.fn<any>().mockImplementation(() => ({
      messages: {
        create: vi.fn<any>().mockResolvedValue({
          content: [{ type: 'text', text: 'Mock Anthropic response' }],
          role: 'assistant'
        }),
        stream: vi.fn<any>().mockImplementation(async function* () {
          yield { type: 'content_block_delta', delta: { text: 'Mock Anthropic streaming response' } };
        })
      }
    }))
  }));

  // Mock Google Generative AI SDK
  vi.mock('@google/generative-ai', () => ({
    GoogleGenerativeAI: vi.fn<any>().mockImplementation(() => ({
      getGenerativeModel: vi.fn<any>().mockReturnValue({
        generateContent: vi.fn<any>().mockResolvedValue({
          response: {
            text: vi.fn<any>().mockReturnValue('Mock Google response')
          }
        }),
        generateContentStream: vi.fn<any>().mockResolvedValue({
          stream: (async function* () {
            yield { text: vi.fn<any>().mockReturnValue('Mock Google streaming response') };
          })()
        })
      })
    }))
  }));
}

/**
 * Environment and Path Mocking
 * Ensures consistent test environment across reorganized files
 */
export function setupEnvironmentMocks(): void {
  // Mock path module for cross-platform compatibility
  vi.mock('path', () => ({
    join: (...paths: string[]) => paths.filter(p => p).join('/'),
    dirname: (path: string) => path.split('/').slice(0, -1).join('/'),
    basename: (path: string) => path.split('/').pop() || '',
    extname: (path: string) => {
      const name = path.split('/').pop() || '';
      const lastDot = name.lastIndexOf('.');
      return lastDot >= 0 ? name.substring(lastDot) : '';
    },
    resolve: (...paths: string[]) => '/' + paths.filter(p => p).join('/'),
    relative: (from: string, to: string) => to,
    normalize: (path: string) => path,
    isAbsolute: (path: string) => path.startsWith('/')
  }));

  // Mock os module
  vi.mock('os', () => ({
    tmpdir: () => '/tmp',
    homedir: () => '/home/user',
    platform: () => 'linux',
    type: () => 'Linux'
  }));
}

/**
 * Event System Mocking  
 * Mocks event emitters for testing event-driven functionality
 */
export function setupEventMocks(): void {
  // Mock events module
  vi.mock('events', () => ({
    EventEmitter: vi.fn<any>().mockImplementation(() => ({
      on: vi.fn<any>(),
      off: vi.fn<any>(),
      emit: vi.fn<any>(),
      removeAllListeners: vi.fn<any>(),
      addListener: vi.fn<any>(),
      removeListener: vi.fn<any>(),
      listeners: vi.fn<any>().mockReturnValue([]),
      eventNames: vi.fn<any>().mockReturnValue([])
    }))
  }));
}

/**
 * Utility Module Mocking
 * Mocks utility modules that tests might depend on
 */
export function setupUtilityMocks(): void {
  // Mock crypto module for ID generation
  vi.mock('crypto', () => ({
    randomUUID: vi.fn<any>(() => 'mock-uuid-12345'),
    randomBytes: vi.fn<any>(() => Buffer.from('mock-random-bytes')),
    createHash: vi.fn<any>(() => ({
      update: vi.fn<any>().mockReturnThis(),
      digest: vi.fn<any>(() => 'mock-hash')
    }))
  }));

  // Mock util module
  vi.mock('util', () => ({
    promisify: vi.fn<any>((fn: any) => fn),
    inspect: vi.fn<any>((obj: any) => JSON.stringify(obj)),
    format: vi.fn<any>((...args: any[]) => args.join(' '))
  }));
}

/**
 * Direct Integration Module Mocking
 * Mocks the direct integration modules (openai-direct, anthropic-direct, google-direct)
 */
export function setupDirectIntegrationMocks(): void {
  // Mock OpenAI direct integration
  vi.mock('../../../core/openai-direct', () => ({
    createOpenAIClientForAgent: vi.fn<any>().mockReturnValue({}),
    createClientForProvider: vi.fn<any>().mockReturnValue({}),
    streamOpenAIResponse: vi.fn<any>().mockResolvedValue('Mock OpenAI streaming response'),
    generateOpenAIResponse: vi.fn<any>().mockResolvedValue('Mock OpenAI response')
  }));

  // Mock Anthropic direct integration
  vi.mock('../../../core/anthropic-direct', () => ({
    createAnthropicClientForAgent: vi.fn<any>().mockReturnValue({}),
    streamAnthropicResponse: vi.fn<any>().mockResolvedValue('Mock Anthropic streaming response'),
    generateAnthropicResponse: vi.fn<any>().mockResolvedValue('Mock Anthropic response')
  }));

  // Mock Google direct integration
  vi.mock('../../../core/google-direct', () => ({
    createGoogleClientForAgent: vi.fn<any>().mockReturnValue({}),
    streamGoogleResponse: vi.fn<any>().mockResolvedValue('Mock Google streaming response'),
    generateGoogleResponse: vi.fn<any>().mockResolvedValue('Mock Google response')
  }));
}

/**
 * Complete Mock Setup
 * Sets up all mocks needed for test reorganization
 */
export function setupAllMocks(): void {
  setupFileSystemMocks();
  setupAgentStorageMocks();
  setupLLMManagerMocks();
  setupDirectSDKMocks();
  setupDirectIntegrationMocks();
  setupEnvironmentMocks();
  setupEventMocks();
  setupUtilityMocks();
}

/**
 * Mock Reset Utilities
 * Provides functions to reset mocks between tests
 */
export function resetAllMocks(): void {
  vi.clearAllMocks();
  vi.resetAllMocks();

  // Reset environment variables
  delete process.env.AGENT_WORLD_DATA_PATH;
  delete process.env.AGENT_WORLD_ID;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GOOGLE_API_KEY;

  // Set test environment
  process.env.NODE_ENV = 'test';
}

/**
 * Validation Utilities
 * Helps verify mocks are working correctly during reorganization
 */
export function validateMockSetup(): boolean {
  try {
    // Test that core modules are mocked
    const fs = require('fs');
    const agentStorage = require('../../core/agent-storage');
    const llmManager = require('../../core/llm-manager');

    // Basic validation that functions exist and are mocked
    return (
      typeof fs.promises.readFile === 'function' &&
      typeof agentStorage.saveAgentToDisk === 'function' &&
      typeof llmManager.streamAgentResponse === 'function'
    );
  } catch (error) {
    console.warn('Mock validation failed:', error);
    return false;
  }
}

/**
 * Import Path Resolution Helper
 * Helps tests find the correct import paths after reorganization
 */
export function getImportPath(module: string, fromDir: string): string {
  const pathMap: Record<string, Record<string, string>> = {
    'core/agent-storage': {
      'tests/core/agents': '../../../core/agent-storage',
      'tests/core/storage': '../../../core/agent-storage',
      'tests/core/utilities': '../../../core/agent-storage',
      'tests/core/shared': '../../../core/agent-storage',
      'tests/core': '../../core/agent-storage'
    },
    'core/llm-manager': {
      'tests/core/agents': '../../../core/llm-manager',
      'tests/core/storage': '../../../core/llm-manager',
      'tests/core/utilities': '../../../core/llm-manager',
      'tests/core/shared': '../../../core/llm-manager',
      'tests/core': '../../core/llm-manager'
    },
    'core/events': {
      'tests/core/agents': '../../../core/events',
      'tests/core/storage': '../../../core/events',
      'tests/core/utilities': '../../../core/events',
      'tests/core/shared': '../../../core/events',
      'tests/core': '../../core/events'
    }
  };

  return pathMap[module]?.[fromDir] || `../../${module}`;
}

// Auto-setup when imported
setupAllMocks();

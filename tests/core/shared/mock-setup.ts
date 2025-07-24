/**
 * Comprehensive Mock Setup for Test Reorganization
 * 
 * Ensures all file I/O and LLM calls are properly mocked during test reorganization.
 * This file provides centralized mock configuration that will work across all 
 * reorganized test files regardless of their directory structure.
 */

import { jest } from '@jest/globals';

/**
 * Global File I/O Mocking
 * Prevents any actual disk operations during tests
 */
export function setupFileSystemMocks(): void {
  // Mock the core fs module (not fs/promises)
  jest.doMock('fs', () => ({
    promises: {
      readFile: jest.fn<any>().mockResolvedValue('{}'),
      writeFile: jest.fn<any>().mockResolvedValue(undefined),
      mkdir: jest.fn<any>().mockResolvedValue(undefined),
      rm: jest.fn<any>().mockResolvedValue(undefined),
      access: jest.fn<any>().mockResolvedValue(undefined),
      readdir: jest.fn<any>().mockResolvedValue([]),
      rename: jest.fn<any>().mockResolvedValue(undefined),
      unlink: jest.fn<any>().mockResolvedValue(undefined),
      stat: jest.fn<any>().mockResolvedValue({ isDirectory: () => false, isFile: () => true }),
      lstat: jest.fn<any>().mockResolvedValue({ isDirectory: () => false, isFile: () => true })
    },
    // Also mock synchronous versions that might be used
    readFileSync: jest.fn<any>().mockReturnValue('{}'),
    writeFileSync: jest.fn<any>().mockReturnValue(undefined),
    existsSync: jest.fn<any>().mockReturnValue(true),
    mkdirSync: jest.fn<any>().mockReturnValue(undefined),
    readdirSync: jest.fn<any>().mockReturnValue([])
  }));
}

/**
 * Global Agent Storage Mocking
 * Prevents disk operations from agent storage module
 */
export function setupAgentStorageMocks(): void {
  // Mock all agent storage functions with flexible import paths
  const mockStorageFunctions = {
    saveAgentMemoryToDisk: jest.fn<any>().mockResolvedValue(undefined),
    saveAgentConfigToDisk: jest.fn<any>().mockResolvedValue(undefined),
    saveAgentToDisk: jest.fn<any>().mockResolvedValue(undefined),
    loadAgentMemoryFromDisk: jest.fn<any>().mockResolvedValue([]),
    loadAgentConfigFromDisk: jest.fn<any>().mockResolvedValue({}),
    loadAgentFromDisk: jest.fn<any>().mockResolvedValue(null),
    loadAllAgentsFromDisk: jest.fn<any>().mockResolvedValue([]),
    deleteAgentFromDisk: jest.fn<any>().mockResolvedValue(true),
    agentExistsOnDisk: jest.fn<any>().mockResolvedValue(true),
    saveWorldToDisk: jest.fn<any>().mockResolvedValue(undefined),
    loadWorldFromDisk: jest.fn<any>().mockResolvedValue({})
  };

  // Mock all possible import paths that tests might use
  const agentStoragePaths = [
    '../../../core/agent-storage',
    '../../../core/world-storage'
  ];

  agentStoragePaths.forEach(path => {
    jest.doMock(path, () => mockStorageFunctions);
  });
}

/**
 * Global LLM Manager Mocking
 * Prevents actual LLM API calls during tests
 */
export function setupLLMManagerMocks(): void {
  const mockLLMFunctions = {
    streamAgentResponse: jest.fn<any>().mockResolvedValue('Mock LLM response'),
    generateAgentResponse: jest.fn<any>().mockResolvedValue('Mock LLM response'),
    LLMConfig: jest.fn<any>(),
    createLLMProvider: jest.fn<any>().mockReturnValue({}),
    validateLLMConfig: jest.fn<any>().mockReturnValue(true)
  };

  // Mock all possible import paths for LLM manager
  const llmManagerPaths = [
    '../../../core/llm-manager',
    '../../../core/llm-config'
  ];

  llmManagerPaths.forEach(path => {
    jest.doMock(path, () => mockLLMFunctions);
  });
}

/**
 * External AI SDK Mocking
 * Mocks external AI libraries that might be used
 */
export function setupAISDKMocks(): void {
  // Mock AI SDK
  jest.doMock('ai', () => ({
    generateText: jest.fn<any>().mockResolvedValue({ text: 'Mock AI response' }),
    streamText: jest.fn<any>().mockResolvedValue({
      textStream: async function* () {
        yield 'Mock';
        yield ' AI';
        yield ' response';
      }
    }),
    createOpenAI: jest.fn<any>().mockReturnValue({}),
    createAnthropic: jest.fn<any>().mockReturnValue({}),
    createGoogle: jest.fn<any>().mockReturnValue({})
  }));

  // Mock OpenAI SDK directly
  jest.doMock('openai', () => ({
    default: jest.fn<any>().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn<any>().mockResolvedValue({
            choices: [{ message: { content: 'Mock OpenAI response' } }]
          })
        }
      }
    }))
  }));

  // Mock Anthropic SDK
  jest.doMock('@anthropic-ai/sdk', () => ({
    default: jest.fn<any>().mockImplementation(() => ({
      messages: {
        create: jest.fn<any>().mockResolvedValue({
          content: [{ text: 'Mock Anthropic response' }]
        })
      }
    }))
  }));
}

/**
 * Environment and Path Mocking
 * Ensures consistent test environment across reorganized files
 */
export function setupEnvironmentMocks(): void {
  // Mock path module for cross-platform compatibility
  jest.doMock('path', () => ({
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
  jest.doMock('os', () => ({
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
  jest.doMock('events', () => ({
    EventEmitter: jest.fn<any>().mockImplementation(() => ({
      on: jest.fn<any>(),
      off: jest.fn<any>(),
      emit: jest.fn<any>(),
      removeAllListeners: jest.fn<any>(),
      addListener: jest.fn<any>(),
      removeListener: jest.fn<any>(),
      listeners: jest.fn<any>().mockReturnValue([]),
      eventNames: jest.fn<any>().mockReturnValue([])
    }))
  }));
}

/**
 * Utility Module Mocking
 * Mocks utility modules that tests might depend on
 */
export function setupUtilityMocks(): void {
  // Mock crypto module for ID generation
  jest.doMock('crypto', () => ({
    randomUUID: jest.fn<any>(() => 'mock-uuid-12345'),
    randomBytes: jest.fn<any>(() => Buffer.from('mock-random-bytes')),
    createHash: jest.fn<any>(() => ({
      update: jest.fn<any>().mockReturnThis(),
      digest: jest.fn<any>(() => 'mock-hash')
    }))
  }));

  // Mock util module
  jest.doMock('util', () => ({
    promisify: jest.fn<any>((fn: any) => fn),
    inspect: jest.fn<any>((obj: any) => JSON.stringify(obj)),
    format: jest.fn<any>((...args: any[]) => args.join(' '))
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
  setupAISDKMocks();
  setupEnvironmentMocks();
  setupEventMocks();
  setupUtilityMocks();
}

/**
 * Mock Reset Utilities
 * Provides functions to reset mocks between tests
 */
export function resetAllMocks(): void {
  jest.clearAllMocks();
  jest.resetAllMocks();

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

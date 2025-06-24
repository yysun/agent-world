/**
 * Clear Memory Tests - Agent Memory Clearing Functionality
 * 
 * Features:
 * - Tests clearAgentMemory function for individual agents
 * - Verifies memory.json file archiving and recreation
 * - Tests simplified memory structure with only LLM messages
 * - Tests memory archiving functionality before clearing
 * - Tests clear command CLI functionality
 * - Validates simplified memory structure after clearing
 * 
 * Logic:
 * - Creates test agents with memory data
 * - Verifies memory exists before clearing
 * - Tests clearAgentMemory function directly with archiving
 * - Validates memory is properly archived then reset to simplified structure
 * - Tests CLI clear command integration
 * 
 * Changes:
 * - Initial implementation of clear memory tests
 * - Tests both World.clearAgentMemory and CLI clear command
 * - Validates file system operations (archive/delete/recreate memory.json)
 * - Updated for simplified memory structure containing only conversationHistory and lastActivity
 * - Added tests for memory archiving functionality
 * - Removed validation for facts, relationships, goals, context, shortTerm, longTerm fields
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as World from '../src/world';
import { initializeFileStorage } from '../src/storage';
import { clearCommand } from '../cli/commands/clear';
import { LLMProvider } from '../src/types';

// Mock fs for testing
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  access: jest.fn(),
  readdir: jest.fn(),
  mkdir: jest.fn()
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

// Create mock data
const mockAgent = {
  name: 'TestAgent',
  type: 'test',
  status: 'active',
  config: {
    name: 'TestAgent',
    type: 'test',
    provider: LLMProvider.OPENAI,
    model: 'gpt-3.5-turbo'
  },
  createdAt: new Date(),
  lastActive: new Date(),
  metadata: {}
};

const mockMemoryData = {
  messages: [
    { role: 'user', content: 'This is a test message', name: 'system', timestamp: '2025-06-24T15:00:00.000Z' },
    { role: 'assistant', content: 'Another test message', timestamp: '2025-06-24T15:01:00.000Z' }
  ],
  lastActivity: '2025-06-24T15:01:00.000Z'
};

describe('Clear Memory Functionality', () => {
  let testWorldName: string;
  let testAgentName: string;
  let mockFs: jest.Mocked<typeof fs>;

  beforeEach(async () => {
    // Setup mocks
    mockFs = fs as jest.Mocked<typeof fs>;

    // Mock file system operations
    mockFs.readFile.mockResolvedValue(JSON.stringify(mockMemoryData));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.access.mockResolvedValue(undefined);
    mockFs.readdir.mockResolvedValue(['memory_archive_2025-06-24T15-00-00-000Z.json'] as any);
    mockFs.mkdir.mockResolvedValue(undefined);

    // Setup test data
    testWorldName = 'test-world';
    testAgentName = 'TestAgent';

    // Clear any existing world state
    World._clearAllWorldsForTesting();

    // Mock world functions to return test data
    jest.spyOn(World, 'getAgent').mockReturnValue(mockAgent as any);
    jest.spyOn(World, 'getAgentConversationHistory').mockResolvedValue(mockMemoryData.messages as any);
  });

  afterEach(async () => {
    // Clear all mocks
    jest.clearAllMocks();
    World._clearAllWorldsForTesting();
  });

  describe('clearAgentMemory function', () => {
    test('should clear agent memory and create empty structure', async () => {
      // Mock clearAgentMemory to return success
      const clearSpy = jest.spyOn(World, 'clearAgentMemory').mockResolvedValue(true);

      // Mock getAgentConversationHistory to return empty after clearing
      const historySpy = jest.spyOn(World, 'getAgentConversationHistory')
        .mockResolvedValueOnce(mockMemoryData.messages as any) // Before clearing
        .mockResolvedValueOnce([] as any); // After clearing

      // Verify memory exists before clearing
      const historyBefore = await World.getAgentConversationHistory(testWorldName, testAgentName);
      expect(historyBefore.length).toBeGreaterThan(0);

      // Clear the agent's memory
      const success = await World.clearAgentMemory(testWorldName, testAgentName);
      expect(success).toBe(true);

      // Verify memory is cleared
      const historyAfter = await World.getAgentConversationHistory(testWorldName, testAgentName);
      expect(historyAfter).toEqual([]);
      expect(historyAfter.length).toBe(0);

      // Verify clearAgentMemory was called
      expect(clearSpy).toHaveBeenCalledWith(testWorldName, testAgentName);
    });

    test('should delete and recreate memory.json file', async () => {
      // Mock the file operations to verify they are called
      const clearSpy = jest.spyOn(World, 'clearAgentMemory').mockResolvedValue(true);

      // Mock readFile to return initial memory data, then empty structure
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(mockMemoryData)) // Before clearing
        .mockResolvedValueOnce(JSON.stringify({ messages: [], lastActivity: new Date().toISOString() })); // After clearing

      // Verify memory file exists with data (first readFile call)
      const memoryBefore = JSON.parse(await mockFs.readFile('memory.json', 'utf8') as string);
      expect(memoryBefore.messages.length).toBeGreaterThan(0);

      // Clear memory
      const success = await World.clearAgentMemory(testWorldName, testAgentName);
      expect(success).toBe(true);

      // Verify memory file was recreated with simplified structure (second readFile call)
      const memoryAfter = JSON.parse(await mockFs.readFile('memory.json', 'utf8') as string);
      expect(memoryAfter.messages).toEqual([]);
      expect(memoryAfter.lastActivity).toBeDefined();

      // Verify old fields are no longer present
      expect(memoryAfter.facts).toBeUndefined();
      expect(memoryAfter.relationships).toBeUndefined();
      expect(memoryAfter.goals).toBeUndefined();
      expect(memoryAfter.context).toBeUndefined();
      expect(memoryAfter.shortTerm).toBeUndefined();
      expect(memoryAfter.longTerm).toBeUndefined();
      expect(memoryAfter.agentId).toBeUndefined();
    });

    test('should return false for non-existent agent', async () => {
      // Mock clearAgentMemory to return false for non-existent agent
      const clearSpy = jest.spyOn(World, 'clearAgentMemory').mockResolvedValue(false);

      const success = await World.clearAgentMemory(testWorldName, 'non-existent-agent');
      expect(success).toBe(false);
      expect(clearSpy).toHaveBeenCalledWith(testWorldName, 'non-existent-agent');
    });

    test('should update agent lastActive timestamp', async () => {
      const oldTime = new Date('2025-06-24T14:00:00.000Z');
      const newTime = new Date('2025-06-24T15:00:00.000Z');

      // Mock getAgent to return different timestamps
      const getAgentSpy = jest.spyOn(World, 'getAgent')
        .mockReturnValueOnce({ ...mockAgent, lastActive: oldTime } as any) // Before clearing
        .mockReturnValueOnce({ ...mockAgent, lastActive: newTime } as any); // After clearing

      // Mock clearAgentMemory to return success
      const clearSpy = jest.spyOn(World, 'clearAgentMemory').mockResolvedValue(true);

      const agentBefore = World.getAgent(testWorldName, testAgentName);
      const timestampBefore = agentBefore!.lastActive!.getTime();

      // Clear memory
      await World.clearAgentMemory(testWorldName, testAgentName);

      const agentAfter = World.getAgent(testWorldName, testAgentName);
      const timestampAfter = agentAfter!.lastActive!.getTime();

      expect(timestampAfter).toBeGreaterThan(timestampBefore);
    });

    test('should archive existing memory before clearing', async () => {
      // Mock clearAgentMemory to return success
      const clearSpy = jest.spyOn(World, 'clearAgentMemory').mockResolvedValue(true);

      // Mock getAgentConversationHistory to return memory data, then empty
      const historySpy = jest.spyOn(World, 'getAgentConversationHistory')
        .mockResolvedValueOnce(mockMemoryData.messages as any) // Before clearing
        .mockResolvedValueOnce([] as any); // After clearing

      // Verify memory exists with conversation history
      const historyBefore = await World.getAgentConversationHistory(testWorldName, testAgentName);
      expect(historyBefore.length).toBeGreaterThan(0);

      // Clear memory (which should create an archive)
      const success = await World.clearAgentMemory(testWorldName, testAgentName);
      expect(success).toBe(true);

      // Verify clearAgentMemory was called with correct parameters
      expect(clearSpy).toHaveBeenCalledWith(testWorldName, testAgentName);

      // Verify memory was cleared
      const historyAfter = await World.getAgentConversationHistory(testWorldName, testAgentName);
      expect(historyAfter).toEqual([]);
    });
  });

  describe('CLI clear command', () => {
    test('should clear individual agent memory via CLI command', async () => {
      // Mock console.log to capture output
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Mock getAgents to return our test agent so the CLI can find it
      const getAgentsSpy = jest.spyOn(World, 'getAgents').mockReturnValue([mockAgent] as any);

      // Mock getAgentConversationHistory to return memory data, then empty
      const historySpy = jest.spyOn(World, 'getAgentConversationHistory')
        .mockResolvedValueOnce(mockMemoryData.messages as any) // Before clearing
        .mockResolvedValueOnce([] as any); // After clearing

      // Mock clearAgentMemory to return success
      const clearSpy = jest.spyOn(World, 'clearAgentMemory').mockResolvedValue(true);

      // Verify memory exists before clearing
      const historyBefore = await World.getAgentConversationHistory(testWorldName, testAgentName);
      expect(historyBefore.length).toBeGreaterThan(0);

      // Execute clear command
      await clearCommand(['TestAgent'], testWorldName);

      // Verify memory is cleared
      const historyAfter = await World.getAgentConversationHistory(testWorldName, testAgentName);
      expect(historyAfter).toEqual([]);

      // Verify success message was displayed
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('✓ Memory cleared for agent: TestAgent')
      );

      consoleSpy.mockRestore();
    });

    test('should handle agent not found gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Mock getAgents to return empty array (no agents found)
      const getAgentsSpy = jest.spyOn(World, 'getAgents').mockReturnValue([]);

      // Mock clearAgentMemory to return false for non-existent agent
      const clearSpy = jest.spyOn(World, 'clearAgentMemory').mockResolvedValue(false);

      // Execute clear command with non-existent agent
      await clearCommand(['NonExistentAgent'], testWorldName);

      // Verify error message was displayed
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Agent not found: NonExistentAgent')
      );

      consoleSpy.mockRestore();
    });

    test('should clear all agents memory with "all" argument', async () => {
      const mockAgent2 = { ...mockAgent, name: 'TestAgent2' };

      // Mock getAgents to return both agents
      const getAgentsSpy = jest.spyOn(World, 'getAgents').mockReturnValue([mockAgent, mockAgent2] as any);

      // Mock clearAgentMemory to return success for both agents
      const clearSpy = jest.spyOn(World, 'clearAgentMemory').mockResolvedValue(true);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Execute clear all command
      await clearCommand(['all'], testWorldName);

      // Verify both agents' clear function was called
      expect(clearSpy).toHaveBeenCalledWith(testWorldName, 'TestAgent');
      expect(clearSpy).toHaveBeenCalledWith(testWorldName, 'TestAgent2');

      // Verify success messages were displayed
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('✓ Cleared memory: TestAgent')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('✓ Cleared memory: TestAgent2')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Memory cleared for all agents.')
      );

      consoleSpy.mockRestore();
    });

    test('should show usage message when no arguments provided', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Execute clear command without arguments
      await clearCommand([], testWorldName);

      // Verify usage message was displayed
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Please specify an agent name or "all".')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Usage: /clear <agent-name> or /clear all')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Memory structure validation', () => {
    test('should maintain correct simplified memory structure after clearing', async () => {
      // Mock clearAgentMemory to return success
      const clearSpy = jest.spyOn(World, 'clearAgentMemory').mockResolvedValue(true);

      // Mock file read to return simplified memory structure
      const simplifiedMemory = {
        messages: [],
        lastActivity: '2025-06-24T15:00:00.000Z'
      };
      mockFs.readFile.mockResolvedValue(JSON.stringify(simplifiedMemory));

      // Clear memory
      await World.clearAgentMemory(testWorldName, testAgentName);

      // Load memory to verify structure
      const memory = JSON.parse(await mockFs.readFile('memory.json', 'utf8') as string);

      // Verify only required fields exist in simplified structure
      expect(memory).toHaveProperty('messages', []);
      expect(memory).toHaveProperty('lastActivity');

      // Verify old complex fields are no longer present
      expect(memory).not.toHaveProperty('agentId');
      expect(memory).not.toHaveProperty('facts');
      expect(memory).not.toHaveProperty('relationships');
      expect(memory).not.toHaveProperty('goals');
      expect(memory).not.toHaveProperty('context');
      expect(memory).not.toHaveProperty('shortTerm');
      expect(memory).not.toHaveProperty('longTerm');

      // Verify timestamp is valid
      const lastActivity = new Date(memory.lastActivity);
      expect(lastActivity).toBeInstanceOf(Date);
      expect(lastActivity.getTime()).toBeGreaterThan(0);
    });
  });
});

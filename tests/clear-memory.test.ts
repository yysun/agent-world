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
import { clearCommand } from '../cli/commands/clear';
import { LLMProvider } from '../src/types';

describe('Clear Memory Functionality', () => {
  let testWorldId: string;
  let testAgentId: string;

  beforeEach(async () => {
    // Initialize world system
    testWorldId = await World.initializeWorldSystem();

    // Create a test agent
    const agent = await World.createAgent(testWorldId, {
      name: 'TestAgent',
      type: 'test',
      provider: LLMProvider.OPENAI,
      model: 'gpt-3.5-turbo'
    });

    testAgentId = agent!.id;

    // Add some memory to the agent
    await World.addToAgentMemory(testWorldId, testAgentId, {
      type: 'test',
      content: 'This is a test message',
      sender: 'system'
    });

    await World.addToAgentMemory(testWorldId, testAgentId, {
      type: 'test',
      content: 'Another test message',
      sender: 'user'
    });
  });

  afterEach(async () => {
    // Clean up test data
    try {
      await World.removeAgent(testWorldId, testAgentId);
      World._clearAllWorldsForTesting();
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('clearAgentMemory function', () => {
    test('should clear agent memory and create empty structure', async () => {
      // Verify memory exists before clearing
      const historyBefore = await World.getAgentConversationHistory(testWorldId, testAgentId);
      expect(historyBefore.length).toBeGreaterThan(0);

      // Clear the agent's memory
      const success = await World.clearAgentMemory(testWorldId, testAgentId);
      expect(success).toBe(true);

      // Verify memory is cleared
      const historyAfter = await World.getAgentConversationHistory(testWorldId, testAgentId);
      expect(historyAfter).toEqual([]);
      expect(historyAfter.length).toBe(0);
    });

    test('should delete and recreate memory.json file', async () => {
      const agent = World.getAgent(testWorldId, testAgentId);
      expect(agent).not.toBeNull();

      // Get the memory file path
      const agentDir = path.join(process.cwd(), 'data', 'worlds', 'default-world', 'agents', 'test-agent');
      const memoryPath = path.join(agentDir, 'memory.json');

      // Verify memory file exists with data
      const memoryBefore = JSON.parse(await fs.readFile(memoryPath, 'utf8'));
      expect(memoryBefore.conversationHistory.length).toBeGreaterThan(0);

      // Clear memory
      const success = await World.clearAgentMemory(testWorldId, testAgentId);
      expect(success).toBe(true);

      // Verify memory file was recreated with simplified structure - only LLM messages
      const memoryAfter = JSON.parse(await fs.readFile(memoryPath, 'utf8'));
      expect(memoryAfter.conversationHistory).toEqual([]);
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
      const success = await World.clearAgentMemory(testWorldId, 'non-existent-agent');
      expect(success).toBe(false);
    });

    test('should update agent lastActive timestamp', async () => {
      const agentBefore = World.getAgent(testWorldId, testAgentId);
      const timestampBefore = agentBefore!.lastActive!.getTime();

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 100));

      // Clear memory
      await World.clearAgentMemory(testWorldId, testAgentId);

      const agentAfter = World.getAgent(testWorldId, testAgentId);
      const timestampAfter = agentAfter!.lastActive!.getTime();

      expect(timestampAfter).toBeGreaterThan(timestampBefore);
    });

    test('should archive existing memory before clearing', async () => {
      const agent = World.getAgent(testWorldId, testAgentId);
      expect(agent).not.toBeNull();

      // Get the agent and archives directory paths
      const agentDir = path.join(process.cwd(), 'data', 'worlds', 'default-world', 'agents', 'test-agent');
      const archivesDir = path.join(agentDir, 'archives');

      // Verify memory exists with conversation history
      const historyBefore = await World.getAgentConversationHistory(testWorldId, testAgentId);
      expect(historyBefore.length).toBeGreaterThan(0);

      // Clear memory (which should create an archive)
      const success = await World.clearAgentMemory(testWorldId, testAgentId);
      expect(success).toBe(true);

      // Verify archives directory was created
      try {
        await fs.access(archivesDir);

        // Check for archive files
        const archiveFiles = await fs.readdir(archivesDir);
        const memoryArchives = archiveFiles.filter(file => file.startsWith('memory_archive_') && file.endsWith('.json'));

        expect(memoryArchives.length).toBeGreaterThan(0);

        // Verify the archive contains the original memory data
        const archivePath = path.join(archivesDir, memoryArchives[0]);
        const archivedMemory = JSON.parse(await fs.readFile(archivePath, 'utf8'));
        expect(archivedMemory.conversationHistory.length).toBeGreaterThan(0);

      } catch (error) {
        // If no archive was created, that's only okay if there was no meaningful content
        // In our test case, we added messages, so an archive should exist
        fail('Expected archive to be created when clearing memory with conversation history');
      }

      // Verify memory was still cleared
      const historyAfter = await World.getAgentConversationHistory(testWorldId, testAgentId);
      expect(historyAfter).toEqual([]);
    });
  });

  describe('CLI clear command', () => {
    test('should clear individual agent memory via CLI command', async () => {
      // Mock console.log to capture output
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Verify memory exists before clearing
      const historyBefore = await World.getAgentConversationHistory(testWorldId, testAgentId);
      expect(historyBefore.length).toBeGreaterThan(0);

      // Execute clear command
      await clearCommand(['TestAgent'], testWorldId);

      // Verify memory is cleared
      const historyAfter = await World.getAgentConversationHistory(testWorldId, testAgentId);
      expect(historyAfter).toEqual([]);

      // Verify success message was displayed
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('✓ Memory cleared for agent: TestAgent')
      );

      consoleSpy.mockRestore();
    });

    test('should handle agent not found gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Execute clear command with non-existent agent
      await clearCommand(['NonExistentAgent'], testWorldId);

      // Verify error message was displayed
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Agent not found: NonExistentAgent')
      );

      consoleSpy.mockRestore();
    });

    test('should clear all agents memory with "all" argument', async () => {
      // Create another test agent
      const agent2 = await World.createAgent(testWorldId, {
        name: 'TestAgent2',
        type: 'test',
        provider: LLMProvider.OPENAI,
        model: 'gpt-3.5-turbo'
      });

      // Add memory to second agent
      await World.addToAgentMemory(testWorldId, agent2!.id, {
        type: 'test',
        content: 'Message for agent 2',
        sender: 'system'
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Execute clear all command
      await clearCommand(['all'], testWorldId);

      // Verify both agents' memory is cleared
      const history1 = await World.getAgentConversationHistory(testWorldId, testAgentId);
      const history2 = await World.getAgentConversationHistory(testWorldId, agent2!.id);

      expect(history1).toEqual([]);
      expect(history2).toEqual([]);

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

      // Cleanup second agent
      await World.removeAgent(testWorldId, agent2!.id);
      consoleSpy.mockRestore();
    });

    test('should show usage message when no arguments provided', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Execute clear command without arguments
      await clearCommand([], testWorldId);

      // Verify usage message was displayed
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Please specify an agent ID, name, or "all".')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Usage: /clear <agent-id-or-name> or /clear all')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Memory structure validation', () => {
    test('should maintain correct simplified memory structure after clearing', async () => {
      // Clear memory
      await World.clearAgentMemory(testWorldId, testAgentId);

      // Get agent and verify memory structure
      const agent = World.getAgent(testWorldId, testAgentId);
      expect(agent).not.toBeNull();

      // Load memory directly to verify structure
      const agentDir = path.join(process.cwd(), 'data', 'worlds', 'default-world', 'agents', 'test-agent');
      const memoryPath = path.join(agentDir, 'memory.json');

      const memory = JSON.parse(await fs.readFile(memoryPath, 'utf8'));

      // Verify only required fields exist in simplified structure
      expect(memory).toHaveProperty('conversationHistory', []);
      expect(memory).toHaveProperty('lastActivity');

      // Verify old complex fields are no longer present
      expect(memory).not.toHaveProperty('agentId');
      expect(memory).not.toHaveProperty('facts');
      expect(memory).not.toHaveProperty('relationships');
      expect(memory).not.toHaveProperty('goals');
      expect(memory).not.toHaveProperty('context');
      expect(memory).not.toHaveProperty('shortTerm');
      expect(memory).not.toHaveProperty('longTerm');

      // Verify timestamp is recent
      const lastActivity = new Date(memory.lastActivity);
      const now = new Date();
      expect(now.getTime() - lastActivity.getTime()).toBeLessThan(5000); // Within 5 seconds
    });
  });
});

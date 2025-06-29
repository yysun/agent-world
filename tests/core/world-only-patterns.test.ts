/**
 * World-Only Patterns Test Suite
 * 
 * Features:
 * - Test infrastructure for new world-only architecture
 * - Helper utilities for temporary world directories
 * - Mock data generators for worlds and agents
 * - Clean setup/teardown patterns
 * 
 * Implementation:
 * - Uses world objects as single source of truth
 * - No direct imports of agent-manager or agent-storage
 * - Explicit rootPath parameter handling
 * - Comprehensive test coverage for new patterns
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { createWorld, getWorld, listWorlds, deleteWorld, updateWorld } from '../../core/world-manager.js';
import { World, CreateWorldParams, UpdateWorldParams, CreateAgentParams, LLMProvider } from '../../core/types.js';

/**
 * Test helper for creating temporary world directories
 */
export class TestWorldManager {
  private tempDirs: string[] = [];

  /**
   * Create a temporary directory for test worlds
   */
  async createTempRootPath(): Promise<string> {
    const tempDir = join(tmpdir(), 'agent-world-test-' + randomBytes(8).toString('hex'));
    await fs.mkdir(tempDir, { recursive: true });
    this.tempDirs.push(tempDir);
    return tempDir;
  }

  /**
   * Clean up all temporary directories
   */
  async cleanup(): Promise<void> {
    for (const dir of this.tempDirs) {
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch (error) {
        console.warn(`Failed to clean up temp dir ${dir}:`, error);
      }
    }
    this.tempDirs = [];
  }

  /**
   * Create a test world with default settings
   * Note: Using current API until world-manager is updated
   */
  async createTestWorld(
    rootPath: string,
    overrides: Partial<CreateWorldParams> = {}
  ): Promise<World> {
    const params: CreateWorldParams = {
      name: 'test-world-' + randomBytes(4).toString('hex'),
      description: 'A test world for unit testing',
      turnLimit: 5,
      autoSave: true,
      ...overrides
    };

    // Note: Current API updated to take (rootPath, params)
    const world = await createWorld(rootPath, params);
    // No need to manually set rootPath anymore
    return world;
  }

  /**
   * Create a test agent with default settings
   */
  createTestAgentParams(overrides: Partial<CreateAgentParams> = {}): CreateAgentParams {
    return {
      id: 'test-agent-' + randomBytes(4).toString('hex'),
      name: 'Test Agent',
      type: 'assistant',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: 'You are a helpful test assistant.',
      ...overrides
    };
  }
}

describe('World-Only Patterns Test Infrastructure', () => {
  let testManager: TestWorldManager;
  let rootPath: string;

  beforeEach(async () => {
    testManager = new TestWorldManager();
    rootPath = await testManager.createTempRootPath();
  });

  afterEach(async () => {
    await testManager.cleanup();
  });

  describe('Test Helper Utilities', () => {
    test('should create temporary root path', async () => {
      expect(rootPath).toBeDefined();
      expect(typeof rootPath).toBe('string');

      // Verify directory exists
      const stats = await fs.stat(rootPath);
      expect(stats.isDirectory()).toBe(true);
    });

    test('should create test world with defaults', async () => {
      const world = await testManager.createTestWorld(rootPath);

      expect(world).toBeDefined();
      expect(world.rootPath).toBe(rootPath);
      expect(world.name).toMatch(/^test-world-[a-f0-9]{8}$/);
      expect(world.description).toBe('A test world for unit testing');
      expect(world.turnLimit).toBe(5);
      expect(world.autoSave).toBe(true);
      expect(world.eventEmitter).toBeDefined();
      expect(world.agents).toBeInstanceOf(Map);
    });

    test('should create test world with overrides', async () => {
      const world = await testManager.createTestWorld(rootPath, {
        name: 'custom-test-world',
        turnLimit: 10,
        autoSave: false
      });

      expect(world.name).toBe('custom-test-world');
      expect(world.turnLimit).toBe(10);
      expect(world.autoSave).toBe(false);
    });

    test('should generate test agent parameters', () => {
      const agentParams = testManager.createTestAgentParams();

      expect(agentParams.id).toMatch(/^test-agent-[a-f0-9]{8}$/);
      expect(agentParams.name).toBe('Test Agent');
      expect(agentParams.type).toBe('assistant');
      expect(agentParams.provider).toBe('openai');
      expect(agentParams.model).toBe('gpt-4');
    });

    test('should generate test agent parameters with overrides', () => {
      const agentParams = testManager.createTestAgentParams({
        id: 'custom-agent',
        provider: LLMProvider.ANTHROPIC,
        model: 'claude-3'
      });

      expect(agentParams.id).toBe('custom-agent');
      expect(agentParams.provider).toBe(LLMProvider.ANTHROPIC);
      expect(agentParams.model).toBe('claude-3');
      expect(agentParams.name).toBe('Test Agent'); // Default preserved
    });
  });

  describe('World-Only Access Patterns', () => {
    test('should only access agents through world objects', async () => {
      const world = await testManager.createTestWorld(rootPath);
      const agentParams = testManager.createTestAgentParams();

      // Create agent through world object
      const agent = await world.createAgent(agentParams);
      expect(agent).toBeDefined();
      expect(agent.id).toBe(agentParams.id);

      // Verify agent is in world's runtime map
      expect(world.agents.has(agent.id)).toBe(true);
      expect(world.agents.get(agent.id)).toBe(agent);

      // Get agent through world object
      const retrievedAgent = await world.getAgent(agent.id);
      expect(retrievedAgent).toBeDefined();
      expect(retrievedAgent?.id).toBe(agent.id);
    });

    test('should maintain consistent state in runtime map', async () => {
      const world = await testManager.createTestWorld(rootPath);
      const agentParams = testManager.createTestAgentParams();

      // Create agent
      const agent = await world.createAgent(agentParams);
      expect(world.agents.size).toBe(1);

      // Update agent
      const updatedAgent = await world.updateAgent(agent.id, {
        name: 'Updated Agent Name'
      });
      expect(updatedAgent?.name).toBe('Updated Agent Name');
      expect(world.agents.get(agent.id)?.name).toBe('Updated Agent Name');

      // Delete agent
      const deleted = await world.deleteAgent(agent.id);
      expect(deleted).toBe(true);
      expect(world.agents.size).toBe(0);
      expect(world.agents.has(agent.id)).toBe(false);
    });

    test('should handle agent operations with autoSave enabled', async () => {
      const world = await testManager.createTestWorld(rootPath, { autoSave: true });
      const agentParams = testManager.createTestAgentParams();

      // Create agent (should auto-save)
      const agent = await world.createAgent(agentParams);

      // Note: This test will be updated once new API is implemented
      // Reload world to verify persistence
      // const reloadedWorld = await getWorld(rootPath, world.id);
      // expect(reloadedWorld).toBeDefined();
      // expect(reloadedWorld!.agents.size).toBe(1);
      // expect(reloadedWorld!.agents.has(agent.id)).toBe(true);

      // For now, just verify agent was created
      expect(agent).toBeDefined();
      expect(world.agents.has(agent.id)).toBe(true);
    });

    test('should handle agent operations with autoSave disabled', async () => {
      const world = await testManager.createTestWorld(rootPath, { autoSave: false });
      const agentParams = testManager.createTestAgentParams();

      // Create agent (should not auto-save)
      const agent = await world.createAgent(agentParams);

      // Note: This test will be updated once new API is implemented
      // Reload world - agent should not be persisted yet
      // const reloadedWorld = await getWorld(rootPath, world.id);
      // expect(reloadedWorld).toBeDefined();
      // expect(reloadedWorld!.agents.size).toBe(0);

      // Manual save - will be implemented
      // await world.save();

      // Reload world - agent should now be persisted
      // const finalWorld = await getWorld(rootPath, world.id);
      // expect(finalWorld!.agents.size).toBe(1);
      // expect(finalWorld!.agents.has(agent.id)).toBe(true);

      // For now, just verify agent was created
      expect(agent).toBeDefined();
      expect(world.agents.has(agent.id)).toBe(true);
    });
  });

  describe('EventEmitter Integration', () => {
    test('should provide EventEmitter for world events', async () => {
      const world = await testManager.createTestWorld(rootPath);

      expect(world.eventEmitter).toBeDefined();
      expect(typeof world.eventEmitter.on).toBe('function');
      expect(typeof world.eventEmitter.emit).toBe('function');
      expect(typeof world.eventEmitter.removeListener).toBe('function');
    });

    test('should support event subscription patterns', async () => {
      const world = await testManager.createTestWorld(rootPath);
      const events: string[] = [];

      // Subscribe to events
      world.eventEmitter.on('test-event', (data) => {
        events.push(data);
      });

      // Emit events
      world.eventEmitter.emit('test-event', 'event1');
      world.eventEmitter.emit('test-event', 'event2');

      expect(events).toEqual(['event1', 'event2']);
    });
  });
});

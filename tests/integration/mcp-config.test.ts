/**
 * Integration tests for mcpConfig field functionality
 * Tests the storage backend functionality for mcpConfig
 */

import { MemoryStorage } from '../../core/storage/memory-storage.js';

describe('Memory Storage MCP Config Tests', () => {
  let storage: MemoryStorage;
  
  beforeEach(() => {
    storage = new MemoryStorage();
  });

  test('should store and retrieve mcpConfig in memory storage', async () => {
    const testWorld = {
      id: 'test-world',
      name: 'Test World',
      description: 'Test description',
      turnLimit: 5,
      mcpConfig: '{"servers":[{"name":"test","command":"test"}]}',
      createdAt: new Date(),
      lastUpdated: new Date(),
      totalAgents: 0,
      totalMessages: 0,
      eventEmitter: null as any,
      agents: new Map(),
      chats: new Map()
    };

    await storage.saveWorld(testWorld);
    const retrieved = await storage.loadWorld('test-world');

    expect(retrieved).toBeTruthy();
    expect(retrieved!.mcpConfig).toBe(testWorld.mcpConfig);
  });

  test('should handle null mcpConfig in memory storage', async () => {
    const testWorld = {
      id: 'test-world-null',
      name: 'Test World',
      description: 'Test description',
      turnLimit: 5,
      mcpConfig: null,
      createdAt: new Date(),
      lastUpdated: new Date(),
      totalAgents: 0,
      totalMessages: 0,
      eventEmitter: null as any,
      agents: new Map(),
      chats: new Map()
    };

    await storage.saveWorld(testWorld);
    const retrieved = await storage.loadWorld('test-world-null');

    expect(retrieved).toBeTruthy();
    expect(retrieved!.mcpConfig).toBeNull();
  });

  test('should handle undefined mcpConfig in memory storage', async () => {
    const testWorld = {
      id: 'test-world-undefined',
      name: 'Test World', 
      description: 'Test description',
      turnLimit: 5,
      // mcpConfig is undefined
      createdAt: new Date(),
      lastUpdated: new Date(),
      totalAgents: 0,
      totalMessages: 0,
      eventEmitter: null as any,
      agents: new Map(),
      chats: new Map()
    } as any;

    await storage.saveWorld(testWorld);
    const retrieved = await storage.loadWorld('test-world-undefined');

    expect(retrieved).toBeTruthy();
    expect(retrieved!.mcpConfig).toBeUndefined();
  });
});
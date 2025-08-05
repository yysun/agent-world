/**
 * Basic Test for WorldClass
 * 
 * Simple test to verify WorldClass basic functionality
 */

import { WorldClass } from '../../core/world-class.js';

describe('WorldClass', () => {
  const rootPath = '/test/path';
  const worldId = 'test-world';

  it('should create WorldClass instance and provide basic properties', () => {
    const worldClass = new WorldClass(rootPath, worldId);

    // Test basic properties
    expect(worldClass.id).toBe(worldId);
    expect(worldClass.path).toBe(rootPath);
    expect(worldClass.toString()).toBe(`WorldClass(${worldId})`);

    // Test JSON serialization
    const json = worldClass.toJSON();
    expect(json.id).toBe(worldId);
    expect(json.rootPath).toBe(rootPath);
  });

  it('should handle save method as no-op', async () => {
    const worldClass = new WorldClass(rootPath, worldId);

    // save() should not throw and should be a no-op
    await expect(worldClass.save()).resolves.toBeUndefined();
  });

  it('should have all expected methods defined', () => {
    const worldClass = new WorldClass(rootPath, worldId);

    // World operations
    expect(typeof worldClass.delete).toBe('function');
    expect(typeof worldClass.update).toBe('function');
    expect(typeof worldClass.reload).toBe('function');
    expect(typeof worldClass.exportToMarkdown).toBe('function');
    expect(typeof worldClass.save).toBe('function');

    // Agent operations  
    expect(typeof worldClass.createAgent).toBe('function');
    expect(typeof worldClass.getAgent).toBe('function');
    expect(typeof worldClass.updateAgent).toBe('function');
    expect(typeof worldClass.deleteAgent).toBe('function');
    expect(typeof worldClass.listAgents).toBe('function');
    expect(typeof worldClass.clearAgentMemory).toBe('function');

    // Chat operations
    expect(typeof worldClass.createChatData).toBe('function');
    expect(typeof worldClass.getChatData).toBe('function');
    expect(typeof worldClass.listChats).toBe('function');
    expect(typeof worldClass.deleteChatData).toBe('function');
    expect(typeof worldClass.newChat).toBe('function');
    expect(typeof worldClass.loadChatById).toBe('function');
  });

  it('should maintain consistent ID and path', () => {
    const worldClass1 = new WorldClass(rootPath, worldId);
    const worldClass2 = new WorldClass('/different/path', 'different-id');

    expect(worldClass1.id).toBe(worldId);
    expect(worldClass1.path).toBe(rootPath);

    expect(worldClass2.id).toBe('different-id');
    expect(worldClass2.path).toBe('/different/path');

    // Each instance should be independent
    expect(worldClass1.id).not.toBe(worldClass2.id);
    expect(worldClass1.path).not.toBe(worldClass2.path);
  });
});

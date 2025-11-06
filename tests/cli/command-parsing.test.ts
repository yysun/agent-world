/**
 * Command Parsing Tests
 * 
 * Tests for CLI command parsing with space-separated aliases and bidirectional alias support
 */

import { describe, it, expect } from 'vitest';
import { parseCLICommand, CLI_COMMAND_MAP, CLI_COMMAND_ALIASES } from '../../cli/commands.js';

describe('Command Parsing', () => {
  describe('Space-separated aliases', () => {
    it('should parse /new chat (space-separated) instead of /new-chat', () => {
      const result = parseCLICommand('/new chat');
      expect(result.isValid).toBe(true);
      expect(result.command).toBe('chat create');
      expect(result.commandType).toBe('createChat');
    });

    it('should parse /chat new (bidirectional alias)', () => {
      const result = parseCLICommand('/chat new');
      expect(result.isValid).toBe(true);
      expect(result.command).toBe('chat create');
      expect(result.commandType).toBe('createChat');
    });

    it('should parse /add agent (space-separated) instead of /add-agent', () => {
      const result = parseCLICommand('/add agent TestAgent');
      expect(result.isValid).toBe(true);
      expect(result.command).toBe('agent create');
      expect(result.commandType).toBe('createAgent');
      expect(result.args).toEqual(['TestAgent']);
    });

    it('should parse /agent add TestAgent (bidirectional alias)', () => {
      const result = parseCLICommand('/agent add TestAgent');
      expect(result.isValid).toBe(true);
      expect(result.command).toBe('agent create');
      expect(result.commandType).toBe('createAgent');
      expect(result.args).toEqual(['TestAgent']);
    });
  });

  describe('Original command formats still work', () => {
    it('should parse /chat create', () => {
      const result = parseCLICommand('/chat create');
      expect(result.isValid).toBe(true);
      expect(result.command).toBe('chat create');
      expect(result.commandType).toBe('createChat');
    });

    it('should parse /agent create TestAgent', () => {
      const result = parseCLICommand('/agent create TestAgent');
      expect(result.isValid).toBe(true);
      expect(result.command).toBe('agent create');
      expect(result.commandType).toBe('createAgent');
      expect(result.args).toEqual(['TestAgent']);
    });

    it('should parse /world create', () => {
      const result = parseCLICommand('/world create');
      expect(result.isValid).toBe(true);
      expect(result.command).toBe('world create');
      expect(result.commandType).toBe('createWorld');
    });
  });

  describe('Single-word aliases', () => {
    it('should parse /new as world create', () => {
      const result = parseCLICommand('/new');
      expect(result.isValid).toBe(true);
      expect(result.command).toBe('world create');
      expect(result.commandType).toBe('createWorld');
    });

    it('should parse /add as agent create when world is selected', () => {
      const result = parseCLICommand('/add TestAgent');
      expect(result.isValid).toBe(true);
      expect(result.command).toBe('agent create');
      expect(result.commandType).toBe('createAgent');
      expect(result.args).toEqual(['TestAgent']);
    });

    it('should parse /clear as agent clear', () => {
      const result = parseCLICommand('/clear agent1');
      expect(result.isValid).toBe(true);
      expect(result.command).toBe('agent clear');
      expect(result.commandType).toBe('clearAgentMemory');
      expect(result.args).toEqual(['agent1']);
    });
  });

  describe('Command aliases configuration', () => {
    it('should have bidirectional create/new aliases for chat', () => {
      const chatCreateDef = CLI_COMMAND_MAP['chat create'];
      expect(chatCreateDef).toBeDefined();
      expect(chatCreateDef.aliases).toContain('new chat');
      expect(chatCreateDef.aliases).toContain('chat new');
    });

    it('should have bidirectional create/add aliases for agent', () => {
      const agentCreateDef = CLI_COMMAND_MAP['agent create'];
      expect(agentCreateDef).toBeDefined();
      expect(agentCreateDef.aliases).toContain('add agent');
      expect(agentCreateDef.aliases).toContain('agent add');
    });

    it('should have space-separated aliases for world commands', () => {
      expect(CLI_COMMAND_MAP['world list'].aliases).toContain('list worlds');
      expect(CLI_COMMAND_MAP['world create'].aliases).toContain('create world');
      expect(CLI_COMMAND_MAP['world select'].aliases).toContain('select world');
    });

    it('should have space-separated aliases for chat commands', () => {
      expect(CLI_COMMAND_MAP['chat list'].aliases).toContain('list chats');
      expect(CLI_COMMAND_MAP['chat create'].aliases).toContain('create chat');
      expect(CLI_COMMAND_MAP['chat select'].aliases).toContain('select chat');
    });
  });

  describe('Error handling', () => {
    it('should reject commands without leading slash', () => {
      const result = parseCLICommand('chat create');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Commands must start with /');
    });

    it('should reject unknown commands', () => {
      const result = parseCLICommand('/invalid command');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Unknown command');
    });
  });

  describe('Backward compatibility', () => {
    it('should still resolve list-worlds alias', () => {
      const result = parseCLICommand('/list-worlds');
      expect(result.isValid).toBe(true);
      expect(result.command).toBe('world list');
      expect(result.commandType).toBe('listWorlds');
    });

    it('should still resolve list-agents alias', () => {
      const result = parseCLICommand('/list-agents');
      expect(result.isValid).toBe(true);
      expect(result.command).toBe('agent list');
      expect(result.commandType).toBe('listAgents');
    });

    it('should still resolve list-chats alias', () => {
      const result = parseCLICommand('/list-chats');
      expect(result.isValid).toBe(true);
      expect(result.command).toBe('chat list');
      expect(result.commandType).toBe('listChats');
    });
  });
});

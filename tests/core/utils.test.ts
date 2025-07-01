/**
 * Unit Tests for Core Utilities
 *
 * Features:
 * - Tests for generateId function
 * - Tests for toKebabCase function
 * - Tests for type definitions
 * - Pure unit tests with no external dependencies
 *
 * Implementation:
 * - Tests utility functions in isolation
 * - No file I/O or LLM dependencies
 * - Tests edge cases and error conditions
 * - Validates utility function behavior
 */

import { describe, test, expect } from '@jest/globals';
import { generateId, toKebabCase, extractMentions, determineSenderType, getWorldTurnLimit, prepareMessagesForLLM } from '../../core/utils.js';

describe('Core Utilities', () => {
  describe('generateId', () => {
    test('should generate a valid UUID', () => {
      const id = generateId();
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      // UUID v4 format: 8-4-4-4-12 characters separated by hyphens
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    test('should generate unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });

    test('should generate multiple unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('toKebabCase', () => {
    test('should convert camelCase to kebab-case', () => {
      expect(toKebabCase('camelCase')).toBe('camel-case');
      expect(toKebabCase('myVariableName')).toBe('my-variable-name');
      expect(toKebabCase('someComplexVariableNameHere')).toBe('some-complex-variable-name-here');
    });

    test('should convert spaces to hyphens', () => {
      expect(toKebabCase('hello world')).toBe('hello-world');
      expect(toKebabCase('multiple   spaces   here')).toBe('multiple-spaces-here');
      expect(toKebabCase('  leading and trailing  ')).toBe('leading-and-trailing');
    });

    test('should handle PascalCase', () => {
      expect(toKebabCase('PascalCase')).toBe('pascal-case');
      expect(toKebabCase('MyClassName')).toBe('my-class-name');
    });

    test('should handle special characters', () => {
      expect(toKebabCase('hello@world')).toBe('hello-world');
      expect(toKebabCase('test_with_underscores')).toBe('test-with-underscores');
      expect(toKebabCase('name.with.dots')).toBe('name-with-dots');
      expect(toKebabCase('mixed@#$%special')).toBe('mixed-special');
    });

    test('should handle numbers', () => {
      expect(toKebabCase('version2Name')).toBe('version2name');
      expect(toKebabCase('test123variable')).toBe('test123variable');
      expect(toKebabCase('var2ableWith3Numbers')).toBe('var2able-with3numbers');
    });

    test('should handle multiple consecutive hyphens', () => {
      expect(toKebabCase('test---multiple---hyphens')).toBe('test-multiple-hyphens');
      expect(toKebabCase('a----b----c')).toBe('a-b-c');
    });

    test('should handle empty and edge cases', () => {
      expect(toKebabCase('')).toBe('');
      expect(toKebabCase('a')).toBe('a');
      expect(toKebabCase('A')).toBe('a');
      expect(toKebabCase('-')).toBe('');
      expect(toKebabCase('---')).toBe('');
    });

    test('should handle already kebab-case strings', () => {
      expect(toKebabCase('already-kebab-case')).toBe('already-kebab-case');
      expect(toKebabCase('simple-test')).toBe('simple-test');
    });

    test('should handle mixed formats', () => {
      expect(toKebabCase('mixedFormat With_Spaces@And.Dots')).toBe('mixed-format-with-spaces-and-dots');
      expect(toKebabCase('ComplexMixed_case@With123Numbers')).toBe('complex-mixed-case-with123numbers');
    });
  });

  describe('extractMentions', () => {
    test('should extract single mention', () => {
      expect(extractMentions('Hello @alice')).toEqual(['alice']);
      expect(extractMentions('@bob how are you?')).toEqual(['bob']);
      expect(extractMentions('Hi @charlie-test')).toEqual(['charlie-test']);
    });

    test('should extract only first mention when multiple present', () => {
      expect(extractMentions('Hello @alice @bob @charlie')).toEqual(['alice']);
      expect(extractMentions('@first @second @third')).toEqual(['first']);
      expect(extractMentions('Hey @agent1 and @agent2')).toEqual(['agent1']);
    });

    test('should handle case-insensitive mentions', () => {
      expect(extractMentions('Hello @Alice')).toEqual(['alice']);
      expect(extractMentions('@BOB how are you?')).toEqual(['bob']);
      expect(extractMentions('Hi @ChArLiE')).toEqual(['charlie']);
    });

    test('should handle mentions with special characters', () => {
      expect(extractMentions('Hello @agent-1')).toEqual(['agent-1']);
      expect(extractMentions('@test_agent')).toEqual(['test_agent']);
      expect(extractMentions('@agent_with-mixed')).toEqual(['agent_with-mixed']);
    });

    test('should handle edge cases', () => {
      expect(extractMentions('')).toEqual([]);
      expect(extractMentions('No mentions here')).toEqual([]);
      expect(extractMentions('@')).toEqual([]);
      expect(extractMentions('@ invalid')).toEqual([]);
      expect(extractMentions('@123')).toEqual(['123']);
    });

    test('should handle invalid mention formats', () => {
      expect(extractMentions('@agent@invalid')).toEqual(['agent']);
      expect(extractMentions('@@double')).toEqual(['double']);
      expect(extractMentions('@agent with spaces @second')).toEqual(['agent']);
    });
  });

  describe('determineSenderType', () => {
    test('should identify human senders', () => {
      expect(determineSenderType('human')).toBe('human');
      expect(determineSenderType('user')).toBe('human');
      expect(determineSenderType('you')).toBe('human');
      expect(determineSenderType('HUMAN')).toBe('human');
      expect(determineSenderType('User')).toBe('human');
      expect(determineSenderType('YOU')).toBe('human');
    });

    test('should identify system senders', () => {
      expect(determineSenderType('system')).toBe('system');
      expect(determineSenderType('world')).toBe('system');
      expect(determineSenderType('SYSTEM')).toBe('system');
      expect(determineSenderType('World')).toBe('system');
    });

    test('should identify agent senders', () => {
      expect(determineSenderType('alice')).toBe('agent');
      expect(determineSenderType('bob')).toBe('agent');
      expect(determineSenderType('agent-1')).toBe('agent');
      expect(determineSenderType('test_agent')).toBe('agent');
      expect(determineSenderType('RandomName')).toBe('agent');
    });

    test('should handle edge cases', () => {
      expect(determineSenderType(undefined)).toBe('system');
      expect(determineSenderType('')).toBe('system');
      expect(determineSenderType(' ')).toBe('agent');
    });
  });

  describe('getWorldTurnLimit', () => {
    test('should return configured turn limit', () => {
      const world = { turnLimit: 10 } as any;
      expect(getWorldTurnLimit(world)).toBe(10);
    });

    test('should return default turn limit when not configured', () => {
      const world = {} as any;
      expect(getWorldTurnLimit(world)).toBe(5);

      const worldWithUndefined = { turnLimit: undefined } as any;
      expect(getWorldTurnLimit(worldWithUndefined)).toBe(5);
    });

    test('should handle zero turn limit', () => {
      const world = { turnLimit: 0 } as any;
      expect(getWorldTurnLimit(world)).toBe(5); // 0 is falsy, so default is used
    });

    test('should handle negative turn limit', () => {
      const world = { turnLimit: -1 } as any;
      expect(getWorldTurnLimit(world)).toBe(-1); // Negative values are truthy
    });
  });

  describe('prepareMessagesForLLM', () => {
    test('should prepare messages with system prompt', () => {
      const agent = {
        systemPrompt: 'You are a helpful assistant.',
        id: 'test-agent'
      } as any;

      const messageData = {
        content: 'Hello world',
        sender: 'user'
      } as any;

      const messages = prepareMessagesForLLM(agent, messageData);

      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toBe('You are a helpful assistant.');
      expect(messages[1].role).toBe('user');
      expect(messages[1].content).toBe('Hello world');
      expect(messages[1].sender).toBe('user');
    });

    test('should prepare messages without system prompt', () => {
      const agent = {
        id: 'test-agent'
      } as any;

      const messageData = {
        content: 'Hello world',
        sender: 'user'
      } as any;

      const messages = prepareMessagesForLLM(agent, messageData);

      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Hello world');
    });

    test('should include conversation history', () => {
      const agent = {
        systemPrompt: 'You are a helpful assistant.',
        id: 'test-agent'
      } as any;

      const messageData = {
        content: 'Current message',
        sender: 'user'
      } as any;

      const history = [
        { role: 'user', content: 'Previous message', createdAt: new Date() },
        { role: 'assistant', content: 'Previous response', createdAt: new Date() }
      ] as any;

      const messages = prepareMessagesForLLM(agent, messageData, history);

      expect(messages).toHaveLength(4);
      expect(messages[0].role).toBe('system');
      expect(messages[1].content).toBe('Previous message');
      expect(messages[2].content).toBe('Previous response');
      expect(messages[3].content).toBe('Current message');
    });

    test('should handle message with payload content', () => {
      const agent = { id: 'test-agent' } as any;
      const messageData = {
        payload: { content: 'Payload content' },
        sender: 'user'
      } as any;

      const messages = prepareMessagesForLLM(agent, messageData);

      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Payload content');
    });

    test('should handle empty content', () => {
      const agent = { id: 'test-agent' } as any;
      const messageData = {
        sender: 'user'
      } as any;

      const messages = prepareMessagesForLLM(agent, messageData);

      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('');
    });
  });
});

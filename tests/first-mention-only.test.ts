import { shouldRespondToMessage } from '../src/agent';
import { AgentConfig, MessageData, LLMProvider } from '../src/types';

describe('First Mention Only - Agent Response Logic', () => {
  const agent1Config: AgentConfig = {
    name: 'a1',
    type: 'test',
    model: 'test-model',
    provider: LLMProvider.OPENAI,
    systemPrompt: 'You are a1',
    apiKey: 'test-key'
  };

  const agent2Config: AgentConfig = {
    name: 'a2',
    type: 'test',
    model: 'test-model',
    provider: LLMProvider.OPENAI,
    systemPrompt: 'You are a2',
    apiKey: 'test-key'
  };

  describe('First Mention Only Response Logic', () => {
    it('should only respond if agent is first mention - a1 responds, a2 does not', () => {
      const messageData: MessageData = {
        name: 'test-message',
        payload: { content: 'hi @a1 say hi to @a2' },
        id: 'msg-1',
        content: 'hi @a1 say hi to @a2',
        sender: 'HUMAN'
      };

      // a1 should respond (first mention)
      const a1ShouldRespond = shouldRespondToMessage(agent1Config, messageData);
      expect(a1ShouldRespond).toBe(true);

      // a2 should NOT respond (second mention)
      const a2ShouldRespond = shouldRespondToMessage(agent2Config, messageData);
      expect(a2ShouldRespond).toBe(false);
    });

    it('should handle multiple mentions where first is unknown agent', () => {
      const messageData: MessageData = {
        name: 'test-message',
        payload: { content: 'hello @unknown @a2 how are you' },
        id: 'msg-2',
        content: 'hello @unknown @a2 how are you',
        sender: 'HUMAN'
      };

      // a1 should NOT respond (not mentioned)
      const a1ShouldRespond = shouldRespondToMessage(agent1Config, messageData);
      expect(a1ShouldRespond).toBe(false);

      // a2 should NOT respond (not first mention, even though it's a valid agent)
      const a2ShouldRespond = shouldRespondToMessage(agent2Config, messageData);
      expect(a2ShouldRespond).toBe(false);
    });

    it('should handle multiple mentions - only first agent responds', () => {
      const messageData: MessageData = {
        name: 'test-message',
        payload: { content: '@a1 tell @a2 that @a1 says hi' },
        id: 'msg-3',
        content: '@a1 tell @a2 that @a1 says hi',
        sender: 'HUMAN'
      };

      // a1 should respond (first mention)
      const a1ShouldRespond = shouldRespondToMessage(agent1Config, messageData);
      expect(a1ShouldRespond).toBe(true);

      // a2 should NOT respond (not first mention)
      const a2ShouldRespond = shouldRespondToMessage(agent2Config, messageData);
      expect(a2ShouldRespond).toBe(false);
    });

    it('should still treat no mentions as public message - all agents respond', () => {
      const messageData: MessageData = {
        name: 'test-message',
        payload: { content: 'hey everyone how are you doing' },
        id: 'msg-4',
        content: 'hey everyone how are you doing',
        sender: 'HUMAN'
      };

      // Both agents should respond (public message)
      const a1ShouldRespond = shouldRespondToMessage(agent1Config, messageData);
      expect(a1ShouldRespond).toBe(true);

      const a2ShouldRespond = shouldRespondToMessage(agent2Config, messageData);
      expect(a2ShouldRespond).toBe(true);
    });

    it('should handle case insensitive first mention matching', () => {
      const messageData: MessageData = {
        name: 'test-message',
        payload: { content: 'Hi @A1 please talk to @a2' },
        id: 'msg-5',
        content: 'Hi @A1 please talk to @a2',
        sender: 'HUMAN'
      };

      // a1 should respond (first mention, case insensitive)
      const a1ShouldRespond = shouldRespondToMessage(agent1Config, messageData);
      expect(a1ShouldRespond).toBe(true);

      // a2 should NOT respond (second mention)
      const a2ShouldRespond = shouldRespondToMessage(agent2Config, messageData);
      expect(a2ShouldRespond).toBe(false);
    });

    it('should handle agent-to-agent messages with first mention only', () => {
      const messageData: MessageData = {
        name: 'test-message',
        payload: { content: '@a2 please help @a1 with this task' },
        id: 'msg-6',
        content: '@a2 please help @a1 with this task',
        sender: 'a1'
      };

      // a1 should NOT respond (sending agent, not first mention)
      const a1ShouldRespond = shouldRespondToMessage(agent1Config, messageData);
      expect(a1ShouldRespond).toBe(false);

      // a2 should respond (first mention in agent message)
      const a2ShouldRespond = shouldRespondToMessage(agent2Config, messageData);
      expect(a2ShouldRespond).toBe(true);
    });

    it('should still respond to system messages regardless of mentions', () => {
      const messageData: MessageData = {
        name: 'test-message',
        payload: { content: 'System alert: @a2 needs attention but @a1 should also see this' },
        id: 'msg-7',
        content: 'System alert: @a2 needs attention but @a1 should also see this',
        sender: 'system'
      };

      // Both agents should respond (system message)
      const a1ShouldRespond = shouldRespondToMessage(agent1Config, messageData);
      expect(a1ShouldRespond).toBe(true);

      const a2ShouldRespond = shouldRespondToMessage(agent2Config, messageData);
      expect(a2ShouldRespond).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty message', () => {
      const messageData: MessageData = {
        name: 'test-message',
        payload: { content: '' },
        id: 'msg-8',
        content: '',
        sender: 'HUMAN'
      };

      // Both agents should respond (empty = public message)
      const a1ShouldRespond = shouldRespondToMessage(agent1Config, messageData);
      expect(a1ShouldRespond).toBe(true);

      const a2ShouldRespond = shouldRespondToMessage(agent2Config, messageData);
      expect(a2ShouldRespond).toBe(true);
    });

    it('should handle truly malformed mentions (non-letter start)', () => {
      const messageData: MessageData = {
        name: 'test-message',
        payload: { content: 'hello @@ @123 @-invalid how are you' },
        id: 'msg-9',
        content: 'hello @@ @123 @-invalid how are you',
        sender: 'HUMAN'
      };

      // Both agents should respond (no valid mentions = public message)
      const a1ShouldRespond = shouldRespondToMessage(agent1Config, messageData);
      expect(a1ShouldRespond).toBe(true);

      const a2ShouldRespond = shouldRespondToMessage(agent2Config, messageData);
      expect(a2ShouldRespond).toBe(true);
    });

    it('should never respond to own messages regardless of mentions', () => {
      const messageData: MessageData = {
        name: 'test-message',
        payload: { content: '@a1 this is a self message to @a2' },
        id: 'msg-10',
        content: '@a1 this is a self message to @a2',
        sender: 'a1'
      };

      // a1 should NOT respond (own message)
      const a1ShouldRespond = shouldRespondToMessage(agent1Config, messageData);
      expect(a1ShouldRespond).toBe(false);

      // a2 should NOT respond (not first mention)
      const a2ShouldRespond = shouldRespondToMessage(agent2Config, messageData);
      expect(a2ShouldRespond).toBe(false);
    });
  });
});

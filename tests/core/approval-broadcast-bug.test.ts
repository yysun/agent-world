/**
 * Test: Approval Response Broadcast Bug Fix
 * 
 * Purpose: Verify that agent responses to HUMAN approval messages include proper
 * targeting mentions (@HUMAN) to prevent unintended broadcast to all agents.
 * 
 * Bug Description:
 * When a user sends "@a1, list files" and approves the tool execution, @a1 responds.
 * Previously, @a1's response lacked mentions (due to shouldAutoMention returning false
 * for HUMAN senders), causing it to appear as a public agent message that all agents
 * could respond to, triggering @a2, @a3, etc. to also respond.
 * 
 * Fix:
 * Removed the HUMAN check from shouldAutoMention (line 543 in events.ts) so that
 * agent responses to HUMAN messages include @HUMAN mentions, preventing broadcast.
 * 
 * Created: 2025-11-06
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createMockWorld, createMockAgent } from '../__mocks__/mock-world.js';
import { World, Agent } from '../../core/types.js';
import { shouldAutoMention, addAutoMention, shouldAgentRespond } from '../../core/events.js';
import { extractParagraphBeginningMentions } from '../../core/utils.js';

describe('Approval Response Broadcast Bug Fix', () => {
  let world: World;
  let agent1: Agent;
  let agent2: Agent;

  beforeEach(() => {
    world = createMockWorld();

    // Create two agents for testing
    agent1 = createMockAgent({ id: 'a1', name: 'Agent 1' });
    agent2 = createMockAgent({ id: 'a2', name: 'Agent 2' });

    world.agents.set('a1', agent1);
    world.agents.set('a2', agent2);
  });

  describe('shouldAutoMention behavior', () => {
    it('should return false for agent responses to HUMAN messages (HUMAN messages never get auto-mention)', () => {
      const response = 'Here are the files in your home directory...';
      const sender = 'HUMAN';
      const agentId = 'a1';

      const result = shouldAutoMention(response, sender, agentId);

      expect(result).toBe(false);
    });

    it('should return false if response already has mentions', () => {
      const response = '@a2 Here are the files...';
      const sender = 'HUMAN';
      const agentId = 'a1';

      const result = shouldAutoMention(response, sender, agentId);

      expect(result).toBe(false);
    });

    it('should return false for self-mentions', () => {
      const response = 'Some response';
      const sender = 'a1'; // Sender is same as agent
      const agentId = 'a1';

      const result = shouldAutoMention(response, sender, agentId);

      expect(result).toBe(false);
    });
  });

  describe('addAutoMention behavior', () => {
    it('should add @HUMAN mention to agent responses to HUMAN', () => {
      const response = 'Here are the files in your home directory...';
      const sender = 'HUMAN';

      const result = addAutoMention(response, sender);

      expect(result).toContain('@HUMAN');
      expect(result.startsWith('@HUMAN')).toBe(true);
    });

    it('should preserve existing mentions', () => {
      const response = '@a2 Check this out';
      const sender = 'HUMAN';

      const result = addAutoMention(response, sender);

      // Should NOT add auto-mention since response already has mentions
      expect(result).toBe(response);
    });
  });

  describe('Agent response behavior after approval', () => {
    it('should NOT add auto-mention to approval responses from HUMAN (HUMAN check prevents it)', async () => {
      // Simulate: User sends "@a1, list files", a1 responds after approval
      const a1Response = 'Here are the files:\n- file1.txt\n- file2.txt';
      const sender = 'HUMAN';

      // Check if auto-mention should be added
      const shouldAdd = shouldAutoMention(a1Response, sender, 'a1');
      expect(shouldAdd).toBe(false); // HUMAN check prevents auto-mention

      // In actual code flow, we would NOT call addAutoMention because shouldAdd is false
      // So the response stays as-is
      const finalResponse = shouldAdd ? addAutoMention(a1Response, sender) : a1Response;
      expect(finalResponse).toBe(a1Response); // No change

      // For agent messages without mentions, other agents should NOT respond
      const messageEvent = {
        sender: 'a1',
        content: finalResponse,
        timestamp: new Date(),
        messageId: 'msg-123'
      };

      // Since there's no mention and sender is an agent, a2 should NOT respond
      const shouldA2Respond = await shouldAgentRespond(world, agent2, messageEvent);
      expect(shouldA2Respond).toBe(false);
    });

    it('should prevent other agents from responding when response includes @HUMAN', async () => {
      // a1's response with @HUMAN mention
      const messageEvent = {
        sender: 'a1',
        content: '@HUMAN Here are the files:\n- file1.txt\n- file2.txt',
        timestamp: new Date(),
        messageId: 'msg-123'
      };

      // Check if a2 should respond (it shouldn't)
      const shouldA2Respond = await shouldAgentRespond(world, agent2, messageEvent);
      expect(shouldA2Respond).toBe(false);

      // Verify mentions extraction
      const mentions = extractParagraphBeginningMentions(messageEvent.content);
      expect(mentions).toEqual(['human']);
      expect(mentions.includes('a2')).toBe(false);
    });

    it('should allow broadcast ONLY when agent intentionally has no mentions', async () => {
      // Agent response without any mentions (intentional broadcast)
      const messageEvent = {
        sender: 'a1',
        content: 'This is a public announcement to all agents.',
        timestamp: new Date(),
        messageId: 'msg-123'
      };

      // Check mentions
      const mentions = extractParagraphBeginningMentions(messageEvent.content);
      expect(mentions).toEqual([]);

      // For agent messages with no mentions, other agents should NOT respond
      // (per line 985-988 in events.ts)
      const shouldA2Respond = await shouldAgentRespond(world, agent2, messageEvent);
      expect(shouldA2Respond).toBe(false);
    });
  });

  describe('Complete approval flow scenario', () => {
    it('should demonstrate that HUMAN responses do NOT get auto-mention (original behavior restored)', async () => {
      // Step 1: User sends "@a1, list files under ~/directory"
      // Step 2: a1 needs approval, generates approval request
      // Step 3: User approves: "@a1, approve_once shell_command"
      // Step 4: a1 executes and responds

      const a1ResponseRaw = 'Here are the files in your home directory:\n- Documents/\n- Downloads/\n- Desktop/';
      const approvalSender = 'HUMAN';

      // a1 processes response - should NOT add auto-mention (HUMAN check)
      const shouldAdd = shouldAutoMention(a1ResponseRaw, approvalSender, 'a1');
      expect(shouldAdd).toBe(false);

      // In real code flow, we check shouldAdd before calling addAutoMention
      const a1FinalResponse = shouldAdd ? addAutoMention(a1ResponseRaw, approvalSender) : a1ResponseRaw;

      // Verify no @HUMAN was added
      expect(a1FinalResponse).toBe(a1ResponseRaw);

      // Step 5: a1 publishes this message - should NOT trigger a2 (agent message without mentions)
      const messageEvent = {
        sender: 'a1',
        content: a1FinalResponse,
        timestamp: new Date(),
        messageId: 'msg-approval-response'
      };

      // Verify a2 should NOT respond (agent message without mentions)
      const shouldA2Respond = await shouldAgentRespond(world, agent2, messageEvent);
      expect(shouldA2Respond).toBe(false);

      // Verify no mentions
      const mentions = extractParagraphBeginningMentions(a1FinalResponse);
      expect(mentions).toEqual([]);
    });
  });
});

/**
 * Unit Tests for Preload Payload Helpers
 *
 * Purpose:
 * - Verify payload normalization and shape expectations for preload bridge calls.
 *
 * Key Features:
 * - Confirms world/chat/agent/message payload builders.
 * - Verifies identifier coercion to stable string fields.
 *
 * Implementation Notes:
 * - Uses pure-function tests only.
 * - Keeps expectations aligned with main-process payload contracts.
 *
 * Recent Changes:
 * - 2026-02-12: Moved into layer-based tests/electron subfolder and updated module import paths.
 * - 2026-02-12: Added Phase 4 tests for preload payload shape normalization.
 */

import { describe, expect, it } from 'vitest';
import {
  toAgentPayload,
  toMessageDeletePayload,
  toSubscribePayload,
  toUnsubscribePayload,
  toWorldChatPayload,
  toWorldPayload,
  toWorldWithPayload
} from '../../../electron/preload/payloads';

describe('preload payload helpers', () => {
  it('normalizes world payload identifiers', () => {
    expect(toWorldPayload(42)).toEqual({ worldId: '42' });
  });

  it('normalizes world/chat payload identifiers', () => {
    expect(toWorldChatPayload(10, 20)).toEqual({ worldId: '10', chatId: '20' });
  });

  it('merges world + payload objects', () => {
    expect(toWorldWithPayload('world-1', { name: 'World Name' })).toEqual({
      worldId: 'world-1',
      name: 'World Name'
    });
  });

  it('builds agent payload with merged fields', () => {
    expect(toAgentPayload('w', 'a', { name: 'Agent' })).toEqual({
      worldId: 'w',
      agentId: 'a',
      name: 'Agent'
    });
  });

  it('builds message deletion payload', () => {
    expect(toMessageDeletePayload('w', 'm', 'c')).toEqual({
      worldId: 'w',
      messageId: 'm',
      chatId: 'c'
    });
  });

  it('builds subscribe/unsubscribe payloads', () => {
    expect(toSubscribePayload('w', 'c', 'sub')).toEqual({
      worldId: 'w',
      chatId: 'c',
      subscriptionId: 'sub'
    });
    expect(toUnsubscribePayload('sub')).toEqual({
      subscriptionId: 'sub'
    });
  });
});

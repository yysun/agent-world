/**
 * Web Chat History Search Tests
 *
 * Purpose:
 * - Verify chat-session query filtering behavior used by web chat history.
 *
 * Coverage:
 * - Empty query returns all chats.
 * - Matching is case-insensitive.
 * - Non-matching query returns an empty list.
 */

import { describe, expect, it } from 'vitest';
import { filterChatsByQuery } from '../../web/src/components/world-chat-history';

describe('web/world-chat-history search filter', () => {
  const chats = [
    { id: 'chat-1', name: 'Planning Session' },
    { id: 'chat-2', name: 'Bug Triage' },
    { id: 'chat-3', name: 'Release Notes' },
  ];

  it('returns all chats for empty query', () => {
    expect(filterChatsByQuery(chats, '')).toEqual(chats);
    expect(filterChatsByQuery(chats, '   ')).toEqual(chats);
  });

  it('filters chats by case-insensitive substring match', () => {
    const result = filterChatsByQuery(chats, 'triage');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('chat-2');

    const uppercaseResult = filterChatsByQuery(chats, 'RELEASE');
    expect(uppercaseResult).toHaveLength(1);
    expect(uppercaseResult[0].id).toBe('chat-3');
  });

  it('returns empty list when no chats match', () => {
    expect(filterChatsByQuery(chats, 'non-existent')).toEqual([]);
  });
});

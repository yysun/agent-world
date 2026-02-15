/**
 * CLI Process Input Tests
 *
 * Purpose:
 * - Validate plain-message send safeguards in CLI input processing.
 *
 * Key Features Tested:
 * - Reject send when no active chat is selected.
 * - Reject send when active chat cannot be restored.
 * - Bind message publish to explicit active chat ID on success.
 *
 * Implementation Notes:
 * - Uses vitest module mocks for core publish/restore functions.
 * - Keeps tests focused on processCLIInput behavior only.
 *
 * Recent Changes:
 * - 2026-02-15: Added chat-binding and restore guard coverage to prevent chat-id drift in CLI sends.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../core/index.js')>();
  return {
    ...actual,
    publishMessage: vi.fn(),
    restoreChat: vi.fn(async (worldId: string, chatId: string) => ({
      id: worldId,
      currentChatId: chatId
    }))
  };
});

import { processCLIInput } from '../../cli/commands.js';
import { publishMessage, restoreChat } from '../../core/index.js';

describe('processCLIInput message sending', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects plain message when world has no active chat', async () => {
    const world = {
      id: 'world-1',
      name: 'World 1',
      currentChatId: null
    } as any;

    const result = await processCLIInput('hello', world, 'human');

    expect(result.success).toBe(false);
    expect(result.message).toContain('no active chat session');
    expect(restoreChat).not.toHaveBeenCalled();
    expect(publishMessage).not.toHaveBeenCalled();
  });

  it('rejects plain message when active chat cannot be restored', async () => {
    vi.mocked(restoreChat).mockResolvedValueOnce(null as any);

    const world = {
      id: 'world-1',
      name: 'World 1',
      currentChatId: 'chat-missing'
    } as any;

    const result = await processCLIInput('hello', world, 'human');

    expect(result.success).toBe(false);
    expect(result.message).toContain('chat not found: chat-missing');
    expect(restoreChat).toHaveBeenCalledWith('world-1', 'chat-missing');
    expect(publishMessage).not.toHaveBeenCalled();
  });

  it('publishes plain message with explicit active chat binding', async () => {
    const world = {
      id: 'world-1',
      name: 'World 1',
      currentChatId: 'chat-1'
    } as any;

    const result = await processCLIInput('hello', world, 'human');

    expect(result.success).toBe(true);
    expect(restoreChat).toHaveBeenCalledWith('world-1', 'chat-1');
    expect(publishMessage).toHaveBeenCalledWith(world, 'hello', 'human', 'chat-1');
    expect(result.data).toMatchObject({ sender: 'human', chatId: 'chat-1' });
  });
});

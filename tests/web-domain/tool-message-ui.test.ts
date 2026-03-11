/**
 * Web Tool Message UI Tests
 *
 * Purpose:
 * - Verify web tool rows use tool-specific UI classification and keep the existing expand/collapse state flow.
 *
 * Coverage:
 * - Merged assistant tool-call rows classify as tool-renderable rows.
 * - Plain assistant prose does not classify as a tool row.
 * - `toggle-tool-output` flips only the targeted message expansion state.
 *
 * Notes on Implementation:
 * - Uses pure helper exports and world update handlers only.
 * - Avoids DOM rendering and external I/O.
 *
 * Recent Changes:
 * - 2026-03-11: Added coverage for the reserved-indent row class used to align tool cards with avatar-bearing rows.
 * - 2026-03-11: Added coverage for the shared message-surface shadow class used by user, assistant, and tool rows.
 * - 2026-03-11: Added regression coverage for compact web tool-row classification and expand/collapse state handling.
 */

import { describe, expect, it } from 'vitest';
import { getToolToggleLabel, isToolRenderableMessage } from '../../web/src/domain/message-content';
import { getMessageSurfaceShadowClass, getToolRowContainerClass } from '../../web/src/components/world-chat';
import { worldUpdateHandlers } from '../../web/src/pages/World.update';
import { SenderType } from '../../web/src/utils/sender-type';

describe('web/tool message ui', () => {
  it('classifies merged assistant tool-call rows as tool renderable and plain assistant replies as normal chat', () => {
    const mergedAssistantToolRow = {
      id: 'tool-req-1',
      type: 'assistant',
      role: 'assistant',
      sender: 'agent-a',
      text: 'Calling tool: shell_cmd',
      tool_calls: [
        {
          id: 'call-1',
          type: 'function',
          function: {
            name: 'shell_cmd',
            arguments: '{"command":"pwd"}',
          },
        },
      ],
      combinedToolResults: [],
    } as any;
    const plainAssistantReply = {
      id: 'assistant-1',
      type: 'assistant',
      role: 'assistant',
      sender: 'agent-a',
      text: 'Here is the answer.',
    } as any;

    expect(isToolRenderableMessage(mergedAssistantToolRow)).toBe(true);
    expect(isToolRenderableMessage(plainAssistantReply)).toBe(false);
  });

  it('classifies standalone streaming tool rows as tool renderable', () => {
    const streamingToolRow = {
      id: 'tool-stream-1',
      type: 'tool',
      role: 'tool',
      sender: 'agent-a',
      text: 'line 1',
      isToolStreaming: true,
      toolExecution: {
        toolName: 'shell_cmd',
        toolCallId: 'call-1',
      },
    } as any;

    expect(isToolRenderableMessage(streamingToolRow)).toBe(true);
  });

  it('keeps correct accessibility labels for collapsed and expanded tool rows', () => {
    expect(getToolToggleLabel(false)).toBe('Open');
    expect(getToolToggleLabel(true)).toBe('Collapse');
  });

  it('applies the shared surface shadow to user, assistant, and tool rows only', () => {
    expect(getMessageSurfaceShadowClass({ senderType: SenderType.HUMAN, isToolRow: false })).toBe('message-surface-shadow');
    expect(getMessageSurfaceShadowClass({ senderType: SenderType.AGENT, isToolRow: false })).toBe('message-surface-shadow');
    expect(getMessageSurfaceShadowClass({ senderType: SenderType.SYSTEM, isToolRow: true })).toBe('message-surface-shadow');
    expect(getMessageSurfaceShadowClass({ senderType: SenderType.SYSTEM, isToolRow: false })).toBe('');
  });

  it('adds a reserved-indent row class for tool rows only', () => {
    expect(getToolRowContainerClass(true)).toBe('message-row-tool message-row-reserved-indent');
    expect(getToolRowContainerClass(false)).toBe('');
  });

  it('toggles tool output expansion only for the targeted message', () => {
    const toggleHandler = (worldUpdateHandlers as any)['toggle-tool-output'];
    const state = {
      messages: [
        { id: 'tool-1', isToolOutputExpanded: false },
        { id: 'tool-2', isToolOutputExpanded: true },
      ],
      needScroll: true,
    } as any;

    const nextState = toggleHandler(state, 'tool-1');

    expect(nextState.messages).toEqual([
      { id: 'tool-1', isToolOutputExpanded: true },
      { id: 'tool-2', isToolOutputExpanded: true },
    ]);
    expect(nextState.needScroll).toBe(false);
  });
});

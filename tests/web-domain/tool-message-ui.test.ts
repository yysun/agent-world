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
 * - 2026-03-21: Added narrated tool-call border coverage for enveloped failed tool results so persisted failure state still renders the red assistant border.
 * - 2026-03-13: Refreshed narrated assistant tool-call styling coverage while lightening the success/failure border treatment.
 * - 2026-03-13: Added regression coverage so narrated assistant tool-call messages stay on assistant-card layout instead of compact tool rows.
 * - 2026-03-13: Added narrated assistant tool-call border coverage so assistant-shaped planning rows can reflect final tool success/failure.
 * - 2026-03-13: Updated tool-row shadow coverage so flat web tool status rows do not inherit message card chrome.
 * - 2026-03-11: Added coverage for the reserved-indent row class used to align tool cards with avatar-bearing rows.
 * - 2026-03-11: Added coverage for the shared message-surface shadow class used by user, assistant, and tool rows.
 * - 2026-03-11: Added regression coverage for compact web tool-row classification and expand/collapse state handling.
 */

import { describe, expect, it } from 'vitest';
import {
  formatReasoningDuration,
  getReasoningHeaderLabel,
  getToolOneLineSummary,
  getToolToggleLabel,
  isToolRenderableMessage,
  isReasoningExpanded,
} from '../../web/src/domain/message-content';
import { getMessageSurfaceShadowClass, getNarratedToolCallBorderClass, getToolRowContainerClass } from '../../web/src/components/world-chat';
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

  it('keeps narrated assistant tool-call rows on assistant-card layout instead of compact tool rows', () => {
    const narratedAssistantToolCallRow = {
      id: 'assistant-narrated-1',
      type: 'assistant',
      role: 'assistant',
      sender: 'agent-a',
      text: 'I\'ve loaded the yt-dlp skill and will now search for recent videos.',
      tool_calls: [
        {
          id: 'call-narrated-1',
          type: 'function',
          function: {
            name: 'load_skill',
            arguments: '{"skill":"yt-dlp"}',
          },
        },
      ],
      narratedToolCallResults: [{
        id: 'tool-done',
        type: 'tool',
        role: 'tool',
        sender: 'agent-a',
        text: 'status: success',
        createdAt: new Date(),
      }],
    } as any;

    expect(isToolRenderableMessage(narratedAssistantToolCallRow)).toBe(false);
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

  it('formats streaming and completed reasoning labels for web assistant messages', () => {
    expect(formatReasoningDuration(65000)).toBe('1m 5s');
    expect(getReasoningHeaderLabel({
      id: 'assistant-live',
      type: 'assistant',
      role: 'assistant',
      sender: 'agent-a',
      text: 'Answer',
      reasoningContent: 'Reasoning',
      isStreaming: true,
      createdAt: new Date('2026-03-14T12:00:00.000Z'),
    } as any, new Date('2026-03-14T12:01:05.000Z').getTime())).toBe('Thinking ... 1m 5s');

    expect(getReasoningHeaderLabel({
      id: 'assistant-done',
      type: 'assistant',
      role: 'assistant',
      sender: 'agent-a',
      text: 'Answer',
      reasoningContent: 'Reasoning',
      isStreaming: false,
      reasoningDurationMs: 65000,
      createdAt: new Date('2026-03-14T12:00:00.000Z'),
    } as any)).toBe('Thought for 1m 5s');
  });

  it('defaults web reasoning expansion to live-open and completed-collapsed', () => {
    expect(isReasoningExpanded({
      id: 'live',
      type: 'assistant',
      sender: 'agent-a',
      text: 'Answer',
      createdAt: new Date(),
      isStreaming: true,
    } as any)).toBe(true);

    expect(isReasoningExpanded({
      id: 'done',
      type: 'assistant',
      sender: 'agent-a',
      text: 'Answer',
      createdAt: new Date(),
      isStreaming: false,
    } as any)).toBe(false);
  });

  it('applies the shared surface shadow only to user and assistant rows', () => {
    expect(getMessageSurfaceShadowClass({ senderType: SenderType.HUMAN, isToolRow: false })).toBe('message-surface-shadow');
    expect(getMessageSurfaceShadowClass({ senderType: SenderType.AGENT, isToolRow: false })).toBe('message-surface-shadow');
    expect(getMessageSurfaceShadowClass({ senderType: SenderType.SYSTEM, isToolRow: true })).toBe('');
    expect(getMessageSurfaceShadowClass({ senderType: SenderType.SYSTEM, isToolRow: false })).toBe('');
  });

  it('adds a reserved-indent row class for tool rows only', () => {
    expect(getToolRowContainerClass(true)).toBe('message-row-tool message-row-reserved-indent');
    expect(getToolRowContainerClass(false)).toBe('');
  });

  it('adds a green/red assistant-card border class for narrated tool-call rows based on linked tool result status', () => {
    expect(getNarratedToolCallBorderClass({
      id: 'narrated-done',
      type: 'assistant',
      role: 'assistant',
      sender: 'agent-a',
      text: 'I will run the command.',
      createdAt: new Date(),
      narratedToolCallResults: [{
        id: 'tool-done',
        type: 'tool',
        role: 'tool',
        sender: 'agent-a',
        text: 'status: success',
        createdAt: new Date(),
      } as any],
    } as any)).toBe('agent-message-narrated-tool-done');

    expect(getNarratedToolCallBorderClass({
      id: 'narrated-failed',
      type: 'assistant',
      role: 'assistant',
      sender: 'agent-a',
      text: 'I will run the command.',
      createdAt: new Date(),
      narratedToolCallResults: [{
        id: 'tool-failed',
        type: 'tool',
        role: 'tool',
        sender: 'agent-a',
        text: 'status: failed\nreason: non_zero_exit',
        createdAt: new Date(),
      } as any],
    } as any)).toBe('agent-message-narrated-tool-failed');

    expect(getNarratedToolCallBorderClass({
      id: 'narrated-envelope-failed',
      type: 'assistant',
      role: 'assistant',
      sender: 'agent-a',
      text: 'I will run the command.',
      createdAt: new Date(),
      narratedToolCallResults: [{
        id: 'tool-envelope-failed',
        type: 'tool',
        role: 'tool',
        sender: 'agent-a',
        text: JSON.stringify({
          __type: 'tool_execution_envelope',
          version: 1,
          tool: 'search',
          tool_call_id: 'call-search-1',
          status: 'failed',
          preview: {
            kind: 'text',
            renderer: 'text',
            text: 'Search failed',
          },
          result: {
            status: 'failed',
            reason: 'execution_error',
          },
        }),
        createdAt: new Date(),
      } as any],
    } as any)).toBe('agent-message-narrated-tool-failed');

    expect(getNarratedToolCallBorderClass({
      id: 'plain-assistant',
      type: 'assistant',
      role: 'assistant',
      sender: 'agent-a',
      text: 'Regular assistant reply',
      createdAt: new Date(),
    } as any)).toBe('');
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

  it('toggles reasoning expansion only for the targeted message', () => {
    const toggleHandler = (worldUpdateHandlers as any)['toggle-reasoning-output'];
    const state = {
      messages: [
        { id: 'assistant-1', isStreaming: false, isReasoningExpanded: false },
        { id: 'assistant-2', isStreaming: true },
      ],
      needScroll: true,
    } as any;

    const nextState = toggleHandler(state, 'assistant-1');

    expect(nextState.messages).toEqual([
      { id: 'assistant-1', isStreaming: false, isReasoningExpanded: true },
      { id: 'assistant-2', isStreaming: true },
    ]);
    expect(nextState.needScroll).toBe(false);
  });

  it('uses envelope tool names for restored combined web tool summaries', () => {
    const summary = getToolOneLineSummary({
      id: 'assistant-restored',
      type: 'assistant',
      role: 'assistant',
      sender: 'agent-a',
      text: 'Restored tool run',
      createdAt: new Date(),
      combinedToolResults: [{
        id: 'tool-restored-1',
        type: 'tool',
        role: 'tool',
        sender: 'agent-a',
        text: JSON.stringify({
          __type: 'tool_execution_envelope',
          version: 1,
          tool: 'web_fetch',
          tool_call_id: 'call-fetch-1',
          status: 'completed',
          preview: {
            kind: 'text',
            renderer: 'text',
            text: 'Fetched page',
          },
          result: 'Fetched page',
        }),
        createdAt: new Date(),
      } as any],
    } as any);

    expect(summary).toBe('tool: web_fetch - done');
  });
});

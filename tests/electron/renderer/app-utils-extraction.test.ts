/**
 * App Utility Extraction Tests
 * Purpose:
 * - Verify behavior parity for utilities extracted from App.jsx.
 *
 * Key Features:
 * - Covers data transforms, formatting helpers, and form validation helpers.
 * - Ensures sorting, env upsert, and warning parsing remain stable.
 *
 * Implementation Notes:
 * - Uses pure-function tests with deterministic input/output.
 * - No filesystem or network dependencies.
 *
 * Recent Changes:
 * - 2026-02-20: Added coverage for `isRenderableMessageEntry` used by Electron welcome-card visibility logic.
 * - 2026-02-19: Updated phase-label expectations to `calling LLM...` and `streaming response...`.
 * - 2026-02-19: Added coverage for per-agent inline status summary formatting (`buildInlineAgentStatusSummary`).
 * - 2026-02-19: Added coverage for inline agent work phase text helper (`getAgentWorkPhaseText`).
 * - 2026-02-16: Added tests for extracted constants/util modules from App.jsx.
 */

import { describe, expect, it } from 'vitest';
import {
  normalizeStringList,
  normalizeSystemSettings,
  sortSessionsByNewest,
  upsertEnvVariable,
} from '../../../electron/renderer/src/utils/data-transform';
import {
  compactSkillDescription,
  formatLogMessage,
  formatTime,
  getRefreshWarning,
} from '../../../electron/renderer/src/utils/formatting';
import {
  validateAgentForm,
  validateWorldForm,
} from '../../../electron/renderer/src/utils/validation';
import {
  buildInlineAgentStatusSummary,
  getAgentWorkPhaseText,
} from '../../../electron/renderer/src/utils/app-helpers';
import {
  getMessageCardClassName,
  getMessageIdentity,
  getMessageSenderLabel,
  isHumanMessage,
  isRenderableMessageEntry,
  isToolRelatedMessage,
  isTrueAgentResponseMessage,
  resolveMessageAvatar,
} from '../../../electron/renderer/src/utils/message-utils';

describe('extracted data-transform utils', () => {
  it('normalizes and sorts string lists with deduplication', () => {
    expect(normalizeStringList([' b ', 'a', 'b', '', null])).toEqual(['a', 'b']);
  });

  it('normalizes system settings with safe defaults', () => {
    const result = normalizeSystemSettings({
      storageType: 'sqlite',
      enableGlobalSkills: false,
      disabledGlobalSkillIds: ['z', 'a', 'z']
    });

    expect(result.storageType).toBe('sqlite');
    expect(result.enableGlobalSkills).toBe(false);
    expect(result.enableProjectSkills).toBe(true);
    expect(result.disabledGlobalSkillIds).toEqual(['a', 'z']);
  });

  it('sorts sessions by newest timestamp', () => {
    const sessions = [
      { id: '1', createdAt: '2026-02-10T00:00:00.000Z' },
      { id: '2', updatedAt: '2026-02-16T00:00:00.000Z' },
      { id: '3', createdAt: '2026-02-12T00:00:00.000Z' },
    ];

    expect(sortSessionsByNewest(sessions).map((session) => session.id)).toEqual(['2', '3', '1']);
  });

  it('upserts env variable in text', () => {
    const initial = 'FOO=bar\nBAZ=qux';
    expect(upsertEnvVariable(initial, 'FOO', '/tmp/work')).toContain('FOO=/tmp/work');
    expect(upsertEnvVariable(initial, 'NEW_KEY', 'value')).toContain('NEW_KEY=value');
  });
});

describe('extracted formatting utils', () => {
  it('formats log message with detail data', () => {
    const message = formatLogMessage({
      message: 'Tool failed',
      data: { error: 'timeout', toolCallId: 'abc123' }
    });

    expect(message).toContain('Tool failed');
    expect(message).toContain('timeout');
    expect(message).toContain('toolCallId=abc123');
  });

  it('formats time safely', () => {
    expect(formatTime('invalid-date')).toBe('');
    expect(formatTime('2026-02-16T12:30:00.000Z')).toMatch(/\d{2}:\d{2}/);
  });

  it('extracts refresh warnings safely', () => {
    expect(getRefreshWarning({ refreshWarning: '  warning  ' })).toBe('warning');
    expect(getRefreshWarning({ refreshWarning: 1 })).toBe('');
  });

  it('compacts long skill descriptions', () => {
    const value = compactSkillDescription('a'.repeat(120));
    expect(value.length).toBe(96);
    expect(value.endsWith('...')).toBe(true);
  });
});

describe('extracted app-helpers utils', () => {
  it('prefers tool-calling phase text when tools are active', () => {
    expect(getAgentWorkPhaseText({
      activeTools: [{ toolName: 'read_file' }],
      activeStreamCount: 1,
      activeAgentCount: 1,
      pendingAgentCount: 2,
    })).toBe('calling tool: read_file');

    expect(getAgentWorkPhaseText({
      activeTools: [{ toolName: 'read_file' }, { toolName: 'write_file' }],
      activeStreamCount: 0,
      activeAgentCount: 1,
      pendingAgentCount: 0,
    })).toBe('calling 2 tools');
  });

  it('uses waiting/queued fallback phases when no tools are active', () => {
    expect(getAgentWorkPhaseText({
      activeTools: [],
      activeStreamCount: 1,
      activeAgentCount: 1,
      pendingAgentCount: 0,
    })).toBe('streaming response...');

    expect(getAgentWorkPhaseText({
      activeTools: [],
      activeStreamCount: 0,
      activeAgentCount: 1,
      pendingAgentCount: 0,
    })).toBe('calling LLM...');

    expect(getAgentWorkPhaseText({
      activeTools: [],
      activeStreamCount: 0,
      activeAgentCount: 0,
      pendingAgentCount: 2,
    })).toBe('queued');
  });

  it('builds per-agent inline status summary text', () => {
    expect(buildInlineAgentStatusSummary({
      activeAgentNames: ['a1'],
      doneAgentNames: [],
      pendingAgentNames: ['a2'],
      pendingAgentCount: 1,
      phaseText: 'streaming response...',
      fallbackAgentName: 'Agent',
    })).toBe('a1: streaming response...; a2: pending ...');

    expect(buildInlineAgentStatusSummary({
      activeAgentNames: ['a1', 'a2'],
      doneAgentNames: [],
      pendingAgentNames: [],
      pendingAgentCount: 1,
      phaseText: 'calling 2 tools',
      fallbackAgentName: 'Agent',
    })).toBe('a1: calling 2 tools; a2: calling 2 tools; 1 pending ...');

    expect(buildInlineAgentStatusSummary({
      activeAgentNames: ['a2'],
      doneAgentNames: ['a1'],
      pendingAgentNames: [],
      pendingAgentCount: 0,
      phaseText: 'streaming response...',
      fallbackAgentName: 'Agent',
    })).toBe('a1: done; a2: streaming response...');
  });
});

describe('extracted validation utils', () => {
  it('validates world form and enforces required fields', () => {
    expect(validateWorldForm({ name: '' }).valid).toBe(false);

    const validResult = validateWorldForm({
      name: 'World',
      turnLimit: 3,
      mcpConfig: '{"ok":true}'
    });
    expect(validResult.valid).toBe(true);
    expect(validResult.data?.name).toBe('World');
  });

  it('rejects invalid world mcp json', () => {
    const result = validateWorldForm({ name: 'World', mcpConfig: '{invalid' });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('MCP Config');
  });

  it('validates agent form and requires name/model', () => {
    expect(validateAgentForm({ name: '', model: 'x' }).valid).toBe(false);
    expect(validateAgentForm({ name: 'a', model: '' }).valid).toBe(false);

    const valid = validateAgentForm({
      name: 'Agent',
      model: 'llama3.1:8b',
      temperature: '0.7',
      maxTokens: '2048'
    });

    expect(valid.valid).toBe(true);
    expect(valid.data?.temperature).toBe(0.7);
    expect(valid.data?.maxTokens).toBe(2048);
  });
});

describe('extracted message utils', () => {
  it('classifies human/tool/assistant message roles correctly', () => {
    expect(isHumanMessage({ role: 'user' })).toBe(true);
    expect(isToolRelatedMessage({ role: 'tool' })).toBe(true);
    expect(isTrueAgentResponseMessage({ role: 'assistant', sender: 'agent-a', content: 'hello' })).toBe(true);
    expect(isTrueAgentResponseMessage({ role: 'assistant', content: 'Calling tool: shell_cmd' })).toBe(false);
  });

  it('returns stable message identity and style class', () => {
    const message = { messageId: 'msg-1', role: 'assistant', sender: 'Agent A' };
    expect(getMessageIdentity(message)).toBe('msg-1');
    expect(isRenderableMessageEntry(message)).toBe(true);
    expect(isRenderableMessageEntry({ role: 'assistant' })).toBe(false);
    const className = getMessageCardClassName(message, new Map(), [message], 0);
    expect(className).toContain('rounded-lg');
  });

  it('builds sender label and avatar fallbacks', () => {
    const agentById = new Map([
      ['a1', { name: 'Planner', initials: 'PL', autoReply: true }]
    ]);
    const agentByName = new Map([
      ['planner', { name: 'Planner', initials: 'PL', autoReply: true }]
    ]);

    const message = { role: 'assistant', sender: 'Planner', fromAgentId: 'a1', messageId: 'm1' };
    expect(getMessageSenderLabel(message, new Map(), [message], 0, agentById, agentByName)).toBe('Planner');
    expect(resolveMessageAvatar(message, agentById, agentByName)).toEqual({ name: 'Planner', initials: 'PL' });
  });
});

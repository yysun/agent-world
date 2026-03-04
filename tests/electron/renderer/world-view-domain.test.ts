/**
 * Electron Renderer World View Domain Tests
 *
 * Purpose:
 * - Verify typed world-view mode normalization and message partitioning behavior.
 *
 * Key Features:
 * - Covers mode and grid choice normalization defaults.
 * - Covers user/system/agent lane partitioning for board/grid/canvas rendering.
 * - Covers deterministic lane sorting behavior for `2+1` and `2+2` layout choices.
 *
 * Implementation Notes:
 * - Uses pure helper tests with deterministic in-memory fixtures.
 * - No filesystem, network, or renderer runtime dependencies.
 *
 * Summary of Recent Changes:
 * - 2026-03-04: Added initial regression coverage for new Electron world-view domain module.
 */

import { describe, expect, it } from 'vitest';
import {
  getGridLaneClassName,
  normalizeWorldGridLayoutChoiceId,
  normalizeWorldViewMode,
  partitionWorldViewMessages,
  sortAgentLanesForGrid,
  type AgentLane,
} from '../../../electron/renderer/src/domain/world-view';

describe('electron/renderer world-view domain', () => {
  it('normalizes world view mode and grid choice defaults safely', () => {
    expect(normalizeWorldViewMode('CHAT')).toBe('chat');
    expect(normalizeWorldViewMode('board')).toBe('board');
    expect(normalizeWorldViewMode('unsupported-mode')).toBe('chat');

    expect(normalizeWorldGridLayoutChoiceId('2+2')).toBe('2+2');
    expect(normalizeWorldGridLayoutChoiceId('2+1')).toBe('2+1');
    expect(normalizeWorldGridLayoutChoiceId('bad')).toBe('1+2');
  });

  it('partitions messages into user, system, and per-agent lanes', () => {
    const partition = partitionWorldViewMessages([
      { messageId: 'm1', role: 'user', content: 'hello' },
      { messageId: 'm2', role: 'assistant', sender: 'Planner', content: 'plan step 1' },
      { messageId: 'm3', role: 'assistant', sender: 'Writer', content: 'draft step 1' },
      { messageId: 'm4', role: 'assistant', sender: 'Planner', content: 'plan step 2' },
      { messageId: 'm5', role: 'system', content: 'metadata event' },
    ]);

    expect(partition.userMessages.map((entry) => entry.message.messageId)).toEqual(['m1']);
    expect(partition.systemMessages.map((entry) => entry.message.messageId)).toEqual(['m5']);
    expect(partition.agentLanes.map((lane) => lane.label)).toEqual(['Planner', 'Writer']);
    expect(partition.agentLanes[0]?.messages.map((entry) => entry.message.messageId)).toEqual(['m2', 'm4']);
    expect(partition.agentLanes[1]?.messages.map((entry) => entry.message.messageId)).toEqual(['m3']);
  });

  it('sorts grid lanes differently for 2+1 and 2+2 options', () => {
    const lanes: AgentLane[] = [
      {
        id: 'a',
        label: 'Alpha',
        messages: [{ index: 1, message: { createdAt: '2026-03-04T10:00:00.000Z' } }],
      },
      {
        id: 'b',
        label: 'Beta',
        messages: [{ index: 2, message: { createdAt: '2026-03-04T12:00:00.000Z' } }],
      },
    ];

    const alphabetical = sortAgentLanesForGrid(lanes, '2+2');
    const recency = sortAgentLanesForGrid(lanes, '2+1');

    expect(alphabetical.map((lane) => lane.label)).toEqual(['Alpha', 'Beta']);
    expect(recency.map((lane) => lane.label)).toEqual(['Beta', 'Alpha']);
    expect(sortAgentLanesForGrid(lanes, '1+2')).toEqual(lanes);
  });

  it('treats the "1" lane as full-width in 1+2 and 2+1 grid choices', () => {
    expect(getGridLaneClassName('1+2', 0)).toContain('md:col-span-2');
    expect(getGridLaneClassName('1+2', 1)).toBe('');
    expect(getGridLaneClassName('2+1', 2)).toContain('md:col-span-2');
    expect(getGridLaneClassName('2+1', 0)).toBe('');
    expect(getGridLaneClassName('2+2', 0)).toBe('');
  });
});

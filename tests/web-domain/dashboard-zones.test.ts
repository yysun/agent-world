/**
 * Unit tests for dashboard zone resolution logic.
 *
 * Purpose: Verify resolveZoneContent and routeStreamEventToZone
 * Key features:
 * - Maps agent messages to correct zones
 * - Handles missing agents (empty zone)
 * - Handles unknown agents (not in any zone)
 * - Returns latest message per agent, not all messages
 */

import { describe, it, expect } from 'vitest';
import {
  resolveZoneContent,
  routeStreamEventToZone,
  isZoneEligibleMessage,
} from '../../web/src/domain/dashboard-zones';
import type { DashboardZone, Message } from '../../web/src/types';

const zones: DashboardZone[] = [
  { id: 'instructions', agent: 'madame-pedagogue', label: 'Exercise', size: 'small' },
  { id: 'composition', agent: 'maestro-composer', label: 'Composition', size: 'small' },
  { id: 'notation', agent: 'monsieur-engraver', label: 'Sheet Music', size: 'large' },
];

function makeMessage(overrides: Partial<Message> & { sender: string }): Message {
  return {
    id: `msg-${Math.random()}`,
    type: 'agent',
    text: 'Some content',
    createdAt: new Date(),
    ...overrides,
  } as Message;
}

describe('isZoneEligibleMessage', () => {
  it('accepts a normal agent message', () => {
    const msg = makeMessage({ sender: 'madame-pedagogue', text: 'Hello' });
    expect(isZoneEligibleMessage(msg)).toBe(true);
  });

  it('rejects tool events', () => {
    const msg = makeMessage({ sender: 'madame-pedagogue', isToolEvent: true });
    expect(isZoneEligibleMessage(msg)).toBe(false);
  });

  it('rejects user-entered messages', () => {
    const msg = makeMessage({ sender: 'human', userEntered: true });
    expect(isZoneEligibleMessage(msg)).toBe(false);
  });

  it('rejects system messages', () => {
    const msg = makeMessage({ sender: 'system', type: 'system' });
    expect(isZoneEligibleMessage(msg)).toBe(false);
  });

  it('rejects empty text', () => {
    const msg = makeMessage({ sender: 'madame-pedagogue', text: '' });
    expect(isZoneEligibleMessage(msg)).toBe(false);
  });
});

describe('resolveZoneContent', () => {
  it('finds latest message per agent for each zone', () => {
    const messages = [
      makeMessage({ sender: 'madame-pedagogue', text: 'Old instruction' }),
      makeMessage({ sender: 'maestro-composer', text: 'Old composition' }),
      makeMessage({ sender: 'madame-pedagogue', text: 'New instruction' }),
      makeMessage({ sender: 'monsieur-engraver', text: 'render_sheet_music(...)' }),
    ];

    const result = resolveZoneContent(zones, messages);

    expect(result.get('instructions')?.message?.text).toBe('New instruction');
    expect(result.get('composition')?.message?.text).toBe('Old composition');
    expect(result.get('notation')?.message?.text).toBe('render_sheet_music(...)');
  });

  it('returns null for zones with no matching agent messages', () => {
    const messages = [
      makeMessage({ sender: 'madame-pedagogue', text: 'Instruction' }),
    ];

    const result = resolveZoneContent(zones, messages);

    expect(result.get('instructions')?.message?.text).toBe('Instruction');
    expect(result.get('composition')?.message).toBeNull();
    expect(result.get('notation')?.message).toBeNull();
  });

  it('skips tool events and user messages', () => {
    const messages = [
      makeMessage({ sender: 'madame-pedagogue', isToolEvent: true, text: 'tool output' }),
      makeMessage({ sender: 'human', userEntered: true, text: 'user message' }),
      makeMessage({ sender: 'madame-pedagogue', text: 'Real content' }),
    ];

    const result = resolveZoneContent(zones, messages);

    expect(result.get('instructions')?.message?.text).toBe('Real content');
  });

  it('ignores messages from unknown agents', () => {
    const messages = [
      makeMessage({ sender: 'unknown-agent', text: 'Who am I?' }),
    ];

    const result = resolveZoneContent(zones, messages);

    expect(result.get('instructions')?.message).toBeNull();
    expect(result.get('composition')?.message).toBeNull();
    expect(result.get('notation')?.message).toBeNull();
  });

  it('handles empty message array', () => {
    const result = resolveZoneContent(zones, []);

    expect(result.size).toBe(3);
    expect(result.get('instructions')?.message).toBeNull();
    expect(result.get('composition')?.message).toBeNull();
    expect(result.get('notation')?.message).toBeNull();
  });

  it('marks streaming messages', () => {
    const messages = [
      makeMessage({ sender: 'madame-pedagogue', text: 'Streaming...', isStreaming: true }),
    ];

    const result = resolveZoneContent(zones, messages);

    expect(result.get('instructions')?.isStreaming).toBe(true);
  });
});

describe('routeStreamEventToZone', () => {
  it('maps known agent to zone id', () => {
    expect(routeStreamEventToZone(zones, 'madame-pedagogue')).toBe('instructions');
    expect(routeStreamEventToZone(zones, 'maestro-composer')).toBe('composition');
    expect(routeStreamEventToZone(zones, 'monsieur-engraver')).toBe('notation');
  });

  it('returns null for unknown agent', () => {
    expect(routeStreamEventToZone(zones, 'unknown-agent')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(routeStreamEventToZone(zones, '')).toBeNull();
  });
});

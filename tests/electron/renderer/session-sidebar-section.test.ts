/**
 * Session Sidebar Section Tests
 *
 * Purpose:
 * - Verify the chat-list indicator styling for sessions waiting on unresolved ask_user_input prompts.
 *
 * Key Features:
 * - Confirms pending sessions use the amber leading-dot treatment.
 * - Confirms non-pending sessions keep the default neutral dot classes.
 *
 * Implementation Notes:
 * - Imports the pure styling helper directly and mocks renderer-only JSX/runtime dependencies.
 * - Avoids DOM rendering to keep Electron renderer coverage deterministic in the node test environment.
 *
 * Recent Changes:
 * - 2026-04-24: Added regression coverage for the pending HITL session indicator.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('react/jsx-runtime', () => ({
  Fragment: 'Fragment',
  jsx: (type: unknown, props: Record<string, unknown> | null, key?: unknown) => ({ type, props: props ?? {}, key }),
  jsxs: (type: unknown, props: Record<string, unknown> | null, key?: unknown) => ({ type, props: props ?? {}, key }),
}), { virtual: true });

vi.mock('react/jsx-dev-runtime', () => ({
  Fragment: 'Fragment',
  jsxDEV: (type: unknown, props: Record<string, unknown> | null, key?: unknown) => ({ type, props: props ?? {}, key }),
}), { virtual: true });

vi.mock('../../../electron/renderer/src/design-system/primitives', () => ({
  Input: 'Input',
}));

import { getSessionIndicatorClass } from '../../../electron/renderer/src/features/chat/components/SessionSidebarSection';

describe('getSessionIndicatorClass', () => {
  it('returns the amber indicator classes for pending HITL sessions', () => {
    expect(getSessionIndicatorClass(true, false)).toContain('bg-amber-400');
    expect(getSessionIndicatorClass(true, true)).toContain('bg-amber-300');
  });

  it('keeps the neutral indicator classes for non-pending sessions', () => {
    expect(getSessionIndicatorClass(false, false)).toContain('bg-sidebar-foreground/35');
    expect(getSessionIndicatorClass(false, true)).toContain('bg-sidebar-foreground/75');
  });
});

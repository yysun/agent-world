/**
 * Web Input Domain Tests
 *
 * Purpose:
 * - Validate keyboard send behavior for the web composer input domain helpers.
 *
 * Key Features:
 * - Ensures Enter sends when message text is non-empty.
 * - Ensures Shift+Enter does not trigger send for multiline textarea input.
 * - Ensures empty/whitespace content is never sent.
 *
 * Implementation Notes:
 * - Tests cover pure functions only (no DOM/runtime dependencies).
 * - Uses vitest unit assertions.
 *
 * Recent Changes:
 * - 2026-02-21: Added coverage for Enter/Shift+Enter behavior introduced for Electron composer parity.
 */

import { describe, expect, it } from 'vitest';
import { shouldSendOnEnter } from '../../web/src/domain/input';

describe('web/input-domain', () => {
  it('sends on Enter when text is present', () => {
    expect(shouldSendOnEnter('Enter', false, 'hello world')).toBe(true);
  });

  it('does not send on Shift+Enter', () => {
    expect(shouldSendOnEnter('Enter', true, 'hello world')).toBe(false);
  });

  it('does not send when content is blank', () => {
    expect(shouldSendOnEnter('Enter', false, '   ')).toBe(false);
  });
});

/**
 * Electron Renderer Markdown Rendering Tests
 *
 * Purpose:
 * - Verify markdown rendering behavior used by Electron chat message content.
 *
 * Key Features:
 * - Covers multiline markdown link normalization before parser execution.
 * - Asserts rendered HTML output contains the expected anchor tag.
 *
 * Implementation Notes:
 * - Mocks DOMPurify to keep tests deterministic in Node test environment.
 * - Tests parser/output behavior at the renderMarkdown unit boundary.
 *
 * Summary of Recent Changes:
 * - 2026-02-28: Added regression coverage for multiline bracket-wrapped markdown links.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('dompurify', () => ({
  default: {
    sanitize: (html: string) => html,
  },
}));

import { renderMarkdown } from '../../../electron/renderer/src/utils/markdown';

describe('electron renderer markdown rendering', () => {
  it('renders multiline wrapped markdown links as anchors', () => {
    const input = `[

Build an MCP App

](/extensions/apps/build)`;

    const html = renderMarkdown(input);

    expect(html).toContain('<a href="/extensions/apps/build">Build an MCP App</a>');
  });
});

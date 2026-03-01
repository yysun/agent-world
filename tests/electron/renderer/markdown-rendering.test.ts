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
 * - 2026-02-28: Added regression coverage that sanitizer URL policy allows base64 SVG data URIs for markdown images.
 * - 2026-02-28: Added regression coverage for multiline bracket-wrapped markdown links.
 */

import { describe, expect, it, vi } from 'vitest';

const sanitizeMock = vi.fn((html: string) => html);
const purifierInstance = {
  sanitize: sanitizeMock,
};
const dompurifyFactory = Object.assign(
  (_window?: unknown) => purifierInstance,
  {
    sanitize: sanitizeMock,
    default: purifierInstance,
  }
);

vi.mock('dompurify', () => ({
  default: dompurifyFactory,
  sanitize: sanitizeMock,
}));

import {
  createMarkdownSanitizeOptions,
  renderMarkdown,
} from '../../../electron/renderer/src/utils/markdown';

describe('electron renderer markdown rendering', () => {
  it('passes URL policy that allows base64 svg image data URIs', () => {
    const svgDataUri = 'data:image/svg+xml;base64,PHN2Zy8+';
    const options = createMarkdownSanitizeOptions() as {
      ALLOWED_URI_REGEXP?: RegExp;
      ALLOWED_ATTR?: string[];
      ADD_DATA_URI_TAGS?: string[];
    };

    expect(options.ALLOWED_URI_REGEXP).toBeInstanceOf(RegExp);
    expect(options.ALLOWED_URI_REGEXP?.test(svgDataUri)).toBe(true);
    expect(options.ALLOWED_URI_REGEXP?.test('javascript:alert(1)')).toBe(false);
    expect(options.ALLOWED_ATTR).toEqual(expect.arrayContaining(['src', 'href', 'alt', 'title']));
    expect(options.ADD_DATA_URI_TAGS).toEqual(expect.arrayContaining(['img']));
  });

  it('renders multiline wrapped markdown links as anchors', () => {
    const input = `[

Build an MCP App

](/extensions/apps/build)`;

    const html = renderMarkdown(input);

    expect(html).toContain('<a href="/extensions/apps/build">Build an MCP App</a>');
  });
});

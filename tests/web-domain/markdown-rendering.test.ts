/**
 * Markdown Rendering Unit Tests
 *
 * Purpose:
 * - Validate markdown preprocessing helpers added to web/src/utils/markdown.ts
 *   for feature parity with the Electron renderer.
 *
 * Key Features:
 * - isLikelyXmlPayload detection
 * - normalizeXmlForMarkdownDisplay wrapping via renderMarkdown()
 * - normalizeMultilineMarkdownLinks collapsing
 * - renderMarkdown() returns empty string for null/undefined
 *
 * Notes on Implementation:
 * - renderMarkdown() is tested at the public API level.
 * - DOMPurify requires a browser DOM environment; in the vitest/jsdom environment
 *   the sanitize call is a pass-through when window is defined.
 * - In Node (no DOM), dompurify may return the raw HTML – tests assert structure,
 *   not exact HTML, to stay environment-agnostic.
 *
 * Recent Changes:
 * - 2026-03-01: Initial test file created.
 */

import { describe, it, expect, vi } from 'vitest';

// DOMPurify requires a browser DOM which is not available in Node test environment.
// Mock it as a pass-through so we can test the markdown preprocessing pipeline.
vi.mock('dompurify', () => ({
  default: { sanitize: (html: string) => html },
}));

import { renderMarkdown, createMarkdownSanitizeOptions } from '../../web/src/utils/markdown';

describe('createMarkdownSanitizeOptions', () => {
  it('returns ALLOWED_TAGS containing expected safe tags', () => {
    const opts = createMarkdownSanitizeOptions();
    expect(opts.ALLOWED_TAGS).toContain('a');
    expect(opts.ALLOWED_TAGS).toContain('code');
    expect(opts.ALLOWED_TAGS).toContain('table');
  });

  it('has flat ALLOWED_ATTR array of strings', () => {
    const opts = createMarkdownSanitizeOptions();
    expect(Array.isArray(opts.ALLOWED_ATTR)).toBe(true);
    for (const attr of opts.ALLOWED_ATTR) {
      expect(typeof attr).toBe('string');
    }
    expect(opts.ALLOWED_ATTR).toContain('href');
    expect(opts.ALLOWED_ATTR).toContain('src');
  });

  it('forbids script and form tags', () => {
    const opts = createMarkdownSanitizeOptions();
    expect(opts.FORBID_TAGS).toContain('script');
    expect(opts.FORBID_TAGS).toContain('form');
  });
});

describe('renderMarkdown', () => {
  it('returns empty string for null', () => {
    expect(renderMarkdown(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(renderMarkdown(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(renderMarkdown('')).toBe('');
  });

  it('renders bold markdown to HTML', () => {
    const result = renderMarkdown('**hello**');
    expect(result).toContain('hello');
    expect(result).toContain('<strong>');
  });

  it('wraps XML payload in xml code fence', () => {
    const xml = '<scores><score id="1"><title>Hi</title></score></scores>';
    const result = renderMarkdown(xml);
    // The XML content should be inside a <code> block, not rendered as raw HTML elements.
    // The plain tag text should appear in the output.
    expect(result).toContain('scores');
    // Should not expose raw XML as live HTML elements — the tag text is escaped/code-fenced
    expect(result).not.toMatch(/<scores>/);
  });

  it('normalizes multiline markdown link text', () => {
    const md = '[See\nthe docs](https://example.com)';
    const result = renderMarkdown(md);
    expect(result).toContain('href="https://example.com"');
    // Label should be collapsed — no newline inside the anchor text
    expect(result).toContain('See the docs');
  });

  it('does not wrap plain text as XML', () => {
    const result = renderMarkdown('hello world');
    // Should not contain a code block for plain prose
    expect(result).not.toContain('```xml');
    expect(result).not.toContain('<pre><code');
    expect(result).toContain('hello world');
  });
});

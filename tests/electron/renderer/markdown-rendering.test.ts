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
 * - 2026-04-14: Added regression coverage that leading YAML frontmatter fences render paired horizontal rules around the metadata block.
 * - 2026-02-28: Added regression coverage for XML payloads prefixed by command mentions (for example `@engraver`).
 * - 2026-02-28: Added regression coverage for raw XML payload rendering as escaped code text.
 * - 2026-02-28: Added regression coverage that sanitizer URL policy allows base64 SVG data URIs for markdown images.
 * - 2026-02-28: Added regression coverage for multiline bracket-wrapped markdown links.
 */

import { describe, expect, it, vi } from 'vitest';

const { sanitizeMock, dompurifyFactory } = vi.hoisted(() => {
  const sanitize = vi.fn((html: string) => html);
  const purifierInstance = { sanitize };
  const factory = Object.assign(
    (_window?: unknown) => purifierInstance,
    {
      sanitize,
      default: purifierInstance,
    }
  );
  return {
    sanitizeMock: sanitize,
    dompurifyFactory: factory,
  };
});

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
    const httpsUrl = 'https://www.youtube.com/watch?v=Gaf_jCnA6mc';
    const smsUrl = 'sms:+15551234567';
    const options = createMarkdownSanitizeOptions() as {
      ALLOWED_URI_REGEXP?: RegExp;
      ALLOWED_ATTR?: string[];
      ADD_DATA_URI_TAGS?: string[];
    };

    expect(options.ALLOWED_URI_REGEXP).toBeInstanceOf(RegExp);
    expect(options.ALLOWED_URI_REGEXP?.test(svgDataUri)).toBe(true);
    expect(options.ALLOWED_URI_REGEXP?.test(httpsUrl)).toBe(true);
    expect(options.ALLOWED_URI_REGEXP?.test(smsUrl)).toBe(true);
    expect(options.ALLOWED_URI_REGEXP?.test('cid:asset-id')).toBe(false);
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

  it('renders xml payloads as encoded code text', () => {
    const input = `<root><item id="1">alpha</item></root>`;

    const html = renderMarkdown(input);

    expect(html).toContain('&lt;root&gt;');
    expect(html).toContain('&lt;item id=&quot;1&quot;&gt;alpha&lt;/item&gt;');
    expect(html).not.toContain('<root>');
  });

  it('renders xml declaration payloads as encoded code text', () => {
    const input = `<?xml version="1.0" encoding="UTF-8"?>\n<note><to>you</to></note>`;

    const html = renderMarkdown(input);

    expect(html).toContain('&lt;?xml version=&quot;1.0&quot; encoding=&quot;UTF-8&quot;?&gt;');
    expect(html).toContain('&lt;note&gt;&lt;to&gt;you&lt;/to&gt;&lt;/note&gt;');
    expect(html).not.toContain('<?xml version="1.0" encoding="UTF-8"?>');
  });

  it('renders prefixed engraver xml payloads as encoded code text', () => {
    const input = `@engraver
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC
  "-//Recordare//DTD MusicXML 3.1 Partwise//EN"
  "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work>
    <work-title>Classical Piano Sketch in C minor (16 measures)</work-title>
  </work>
</score-partwise>`;

    const html = renderMarkdown(input);

    expect(html).toContain('&lt;?xml version=&quot;1.0&quot; encoding=&quot;UTF-8&quot;?&gt;');
    expect(html).toContain('&lt;!DOCTYPE score-partwise PUBLIC');
    expect(html).toContain('&lt;score-partwise version=&quot;3.1&quot;&gt;');
    expect(html).toContain('@engraver');
    expect(html).not.toContain('<score-partwise version="3.1">');
  });

  it('renders paired horizontal rules for YAML frontmatter fences', () => {
    const input = `---
name: git-wiki
description: |
  Build and maintain a local code-project wiki under .wiki.
---

# Skill Title`;

    const html = renderMarkdown(input);

    expect((html.match(/<hr\s*\/?>/g) || [])).toHaveLength(2);
    expect(html).toContain('name: git-wiki');
    expect(html).toContain('description: |');
    expect(html).not.toContain('<h2>name: git-wiki');
    expect(html).toContain('<h1>Skill Title</h1>');
  });
});

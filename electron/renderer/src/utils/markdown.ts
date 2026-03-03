/**
 * Markdown Rendering Utility for Electron Renderer
 * 
 * Purpose:
 * - Provides safe markdown-to-HTML conversion for message display
 * - Maintains feature parity with web app markdown rendering
 * 
 * Features:
 * - Full markdown support including tables, links, code blocks, etc.
 * - HTML sanitization to prevent XSS attacks using DOMPurify
 * - GitHub Flavored Markdown support
 * - Configurable allowed tags and attributes
 * 
 * Implementation Notes:
 * - Adapted from web app's markdown utility
 * - Uses marked library for parsing
 * - Uses DOMPurify for sanitization
 * - Handles browser/window environment checks
 * 
 * Recent Changes:
 * - 2026-02-28: Added XML payload detection so raw XML content is rendered as escaped markdown code blocks instead of being interpreted as HTML.
 * - 2026-02-28: Fixed DOMPurify attribute allowlist shape to preserve `img src`/`a href` and explicitly allowed data URIs for `img` tags.
 * - 2026-02-28: Allowed safe base64 data image URIs (including SVG) so markdown image embeds render in Electron.
 * - 2026-02-28: Added DOMPurify import-shape normalization for consistent sanitize calls across runtime/test module formats.
 * - 2026-02-28: Added multiline-link normalization so wrapped markdown links render correctly in Electron chat cards.
 * - 2026-02-26: Replaced markdown-render fallback error console logging with categorized renderer logger output.
 * - 2026-02-10: Converted to TypeScript with proper type definitions
 * - 2026-02-10: Initial implementation for Electron app markdown rendering
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { rendererLogger } from './logger';

const dompurify = (typeof window !== 'undefined' && DOMPurify && (DOMPurify as any).default)
  ? (DOMPurify as any).default
  : DOMPurify;

// Configure marked for GitHub Flavored Markdown
marked.setOptions({
  gfm: true, // GitHub Flavored Markdown
  breaks: true, // Convert line breaks to <br>
});

// Configure DOMPurify to allow safe HTML elements
const ALLOWED_TAGS: string[] = [
  'p', 'br', 'strong', 'em', 'u', 'strike', 'del', 's',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'blockquote',
  'code', 'pre',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'a', 'img',
  'hr',
  'div', 'span'
];

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  'a': ['href', 'title'],
  'img': ['src', 'alt', 'title', 'width', 'height'],
  'table': ['class'],
  'th': ['align', 'class'],
  'td': ['align', 'class'],
  'code': ['class'],
  'pre': ['class'],
  'div': ['class'],
  'span': ['class']
};

const ALLOWED_ATTR = Array.from(new Set(Object.values(ALLOWED_ATTRIBUTES).flat()));

// Keep protocol filtering strict while allowing common base64 image data URIs used in markdown.
const ALLOWED_URI_REGEXP = /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$)|data:image\/(?:bmp|gif|jpe?g|png|tiff?|webp|svg\+xml);base64,[a-z0-9+/=\s]+)$/i;

function sanitizeMarkdownHtml(rawHtml: string): string {
  const sanitizeOptions = createMarkdownSanitizeOptions();

  if (dompurify && typeof (dompurify as any).sanitize === 'function') {
    return (dompurify as any).sanitize(rawHtml, sanitizeOptions);
  }

  if (typeof dompurify === 'function' && typeof window !== 'undefined') {
    const createdPurifier = (dompurify as any)(window);
    if (createdPurifier && typeof createdPurifier.sanitize === 'function') {
      return createdPurifier.sanitize(rawHtml, sanitizeOptions);
    }
  }

  return rawHtml;
}

export function createMarkdownSanitizeOptions() {
  return {
    ALLOWED_TAGS: ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    ALLOWED_URI_REGEXP,
    ADD_DATA_URI_TAGS: ['img'],
    FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
  };
}

function normalizeMultilineMarkdownLinks(markdownText: string): string {
  return markdownText.replace(/\[([\s\S]*?)\]\(([^)]*?)\)/g, (_full, rawLabel: string, rawHref: string) => {
    const normalizedLabel = rawLabel
      .replace(/\s*\n\s*/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    const normalizedHref = rawHref
      .replace(/\s*\n\s*/g, '')
      .trim();

    return `[${normalizedLabel}](${normalizedHref})`;
  });
}

function isLikelyXmlPayload(markdownText: string): boolean {
  const trimmed = markdownText.trim();
  if (!trimmed || trimmed.startsWith('```')) {
    return false;
  }

  // Allow command/mention prefixes (for example: "@engraver") before XML content.
  if (/(^|\n)\s*<\?xml\b/i.test(trimmed)) {
    return true;
  }

  if (/(^|\n)\s*<!DOCTYPE\s+[^>]*score-partwise/i.test(trimmed)) {
    return true;
  }

  // Heuristic: treat angle-bracket payloads with matching open/close tags as XML-like content.
  if (!trimmed.startsWith('<') || !trimmed.includes('</')) {
    return false;
  }

  const openTagMatch = trimmed.match(/^<([A-Za-z_][\w:.-]*)(?:\s[^<>]*?)?>/);
  if (!openTagMatch?.[1]) {
    return false;
  }

  const rootTag = openTagMatch[1];
  const closeTagPattern = new RegExp(`</${rootTag}\\s*>`, 'i');
  return closeTagPattern.test(trimmed);
}

function normalizeXmlForMarkdownDisplay(markdownText: string): string {
  if (!isLikelyXmlPayload(markdownText)) {
    return markdownText;
  }

  return `\`\`\`xml\n${markdownText}\n\`\`\``;
}

/**
 * Renders markdown text to safe HTML
 * @param markdownText - The markdown text to render
 * @returns Safe HTML string ready for insertion into DOM
 */
export function renderMarkdown(markdownText: string | null | undefined): string {
  if (!markdownText || typeof markdownText !== 'string') {
    return '';
  }

  try {
    const normalizedMarkdown = normalizeXmlForMarkdownDisplay(
      normalizeMultilineMarkdownLinks(markdownText)
    );

    // Convert markdown to HTML
    const rawHtml = marked(normalizedMarkdown) as string;

    // Sanitize the HTML to prevent XSS
    const sanitizedHtml = sanitizeMarkdownHtml(rawHtml);

    return sanitizedHtml;
  } catch (error) {
    rendererLogger.error('electron.renderer.markdown', 'Error rendering markdown', {
      error: error instanceof Error ? error.message : String(error)
    });
    // Return escaped plain text as fallback
    return markdownText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }
}

/**
 * Check if text appears to contain markdown syntax
 * @param text - Text to check
 * @returns true when common markdown patterns are detected
 */
export function hasMarkdown(text: string | null | undefined): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const markdownPatterns = [
    /^#{1,6}\s+/m,
    /\*\*[^*]+\*\*/,
    /\*[^*]+\*/,
    /`[^`]+`/,
    /```[\s\S]*?```/,
    /^\s*[-*+]\s+/m,
    /^\s*\d+\.\s+/m,
    /^>\s+/m,
    /\[[^\]]+\]\([^)]+\)/,
    /^\|.+\|$/m,
    /^---+$/m,
  ];

  return markdownPatterns.some(pattern => pattern.test(text));
}

/**
 * Markdown Rendering Utility
 *
 * Purpose:
 * - Provide safe markdown-to-HTML conversion for web chat message display
 * - Maintain feature parity with Electron renderer markdown handling
 *
 * Features:
 * - Full markdown support including tables, links, code blocks, etc.
 * - HTML sanitization to prevent XSS attacks using DOMPurify
 * - GitHub Flavored Markdown support
 * - Multiline markdown link normalization
 * - XML payload detection and code-fence wrapping
 * - Base64 image data URI support
 *
 * Recent Changes:
 * - 2026-03-01: Added XML payload detection, multiline link normalization, flat ALLOWED_ATTR,
 *   ALLOWED_URI_REGEXP, and createMarkdownSanitizeOptions() to match Electron renderer.
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';

const dompurify = (typeof window !== 'undefined' && DOMPurify && (DOMPurify as any).default)
  ? (DOMPurify as any).default
  : DOMPurify;

// Configure marked for better table and markdown support
marked.setOptions({
  gfm: true, // GitHub Flavored Markdown
  breaks: true, // Convert line breaks to <br>
  // headerIds: false, // Disable header IDs for security (option not supported in this version)
  // mangle: false, // Don't mangle autolinks (option not supported in this version)
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

export function createMarkdownSanitizeOptions() {
  return {
    ALLOWED_TAGS,
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

    const rawHtml = marked(normalizedMarkdown) as string;

    const sanitizedHtml = dompurify.sanitize(rawHtml, createMarkdownSanitizeOptions() as any);
    return sanitizedHtml;
  } catch (error) {
    console.error('Error rendering markdown:', error);
    return markdownText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }
}

/**
 * Checks if a string contains markdown syntax
 * @param text - Text to check for markdown
 * @returns true if text appears to contain markdown
 */
export function hasMarkdown(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }

  // Simple heuristics to detect common markdown patterns
  const markdownPatterns = [
    /\*\*.*\*\*/, // Bold
    /\*.*\*/, // Italic
    /^#+\s/, // Headers
    /^\|.*\|/, // Tables
    /```/, // Code blocks
    /`.*`/, // Inline code
    /^\s*[-*+]\s/, // Lists
    /^\s*\d+\.\s/, // Numbered lists
    /\[.*\]\(.*\)/, // Links
    /^>\s/, // Blockquotes
  ];

  return markdownPatterns.some(pattern => pattern.test(text));
}
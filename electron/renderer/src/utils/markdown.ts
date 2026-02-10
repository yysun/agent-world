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
 * - 2026-02-10: Converted to TypeScript with proper type definitions
 * - 2026-02-10: Initial implementation for Electron app markdown rendering
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';

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
    // Convert markdown to HTML
    const rawHtml = marked(markdownText) as string;

    // Sanitize the HTML to prevent XSS
    const sanitizedHtml = DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: ALLOWED_TAGS,
      ALLOWED_ATTR: ALLOWED_ATTRIBUTES as any, // DOMPurify types expect string[] but accept Record<string, string[]>
      ALLOW_DATA_ATTR: false,
      ALLOW_UNKNOWN_PROTOCOLS: false,
      FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input', 'button'],
      FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
    });

    return sanitizedHtml;
  } catch (error) {
    console.error('Error rendering markdown:', error);
    // Return escaped plain text as fallback
    return markdownText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }
}

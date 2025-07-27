/**
 * Markdown Usage Example
 * 
 * This file demonstrates how to use the markdown rendering utility
 * in other components throughout the application.
 */

import { renderMarkdown, hasMarkdown, renderMarkdownForComponent } from '../utils/markdown';

// Example 1: Basic usage
export function renderSimpleMarkdown() {
  const markdownText = 'This is **bold** text with `inline code`.';
  const htmlOutput = renderMarkdown(markdownText);
  console.log('Rendered:', htmlOutput);
  // Output: <p>This is <strong>bold</strong> text with <code>inline code</code>.</p>
}

// Example 2: Table rendering
export function renderTableExample() {
  const tableMarkdown = `
| Feature | Status | Priority |
|---------|---------|----------|
| Markdown Support | ✅ Complete | High |
| Table Rendering | ✅ Complete | High |
| Code Blocks | ✅ Complete | Medium |
| Image Support | ⏳ Planned | Low |
  `;
  
  const htmlOutput = renderMarkdown(tableMarkdown);
  console.log('Table rendered:', htmlOutput);
}

// Example 3: Complex document
export function renderComplexDocument() {
  const complexMarkdown = `
# Project Status Report

## Overview
This report summarizes the **current progress** on Agent World features.

### Completed Features
- [x] Real-time chat interface
- [x] Agent management
- [x] Markdown rendering
- [x] Table support

### Performance Metrics
| Metric | Current | Target | Status |
|--------|---------|---------|---------|
| Load Time | 2.1s | <2.0s | 🟡 Near |
| Bundle Size | 140KB | <150KB | ✅ Good |
| Test Coverage | 85% | >90% | 🟡 Near |

### Next Steps
1. **Performance Optimization**
   - Code splitting
   - Lazy loading
2. **Testing**
   - Increase coverage
   - Add integration tests

> **Note**: All features include proper security sanitization.

For technical details, see \`TECHNICAL_GUIDE.md\`.
  `;
  
  return renderMarkdown(complexMarkdown);
}

// Example 4: Using with AppRun components
export function MarkdownMessage({ content }: { content: string }) {
  // Check if content has markdown before rendering
  if (!hasMarkdown(content)) {
    // Return as plain text for performance
    return content;
  }
  
  // Render markdown safely
  const safeHtml = renderMarkdownForComponent(content);
  
  return (
    <div 
      className="markdown-content" 
      dangerouslySetInnerHTML={safeHtml}
    />
  );
}

// Example 5: Conditional rendering based on content
export function SmartMessageRenderer(message: { text: string; type: 'user' | 'agent' }) {
  const hasMarkdownSyntax = hasMarkdown(message.text);
  
  if (hasMarkdownSyntax) {
    // Render with markdown processing
    return (
      <div className={`message ${message.type}-message`}>
        <div 
          className="message-content"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(message.text) }}
        />
      </div>
    );
  } else {
    // Render as plain text for better performance
    return (
      <div className={`message ${message.type}-message`}>
        <div className="message-content">
          {message.text}
        </div>
      </div>
    );
  }
}

// Example 6: Error handling
export function safeMarkdownRender(content: string): string {
  try {
    return renderMarkdown(content);
  } catch (error) {
    console.error('Markdown rendering failed:', error);
    // Fallback to escaped plain text
    return content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }
}
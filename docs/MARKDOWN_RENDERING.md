# Markdown Rendering in Agent World

The Agent World frontend now supports full markdown rendering in message displays, including tables, headers, lists, code blocks, and more.

## Features

- **Full Markdown Support**: Headers, bold/italic text, lists, code blocks, blockquotes
- **Table Rendering**: GitHub Flavored Markdown tables with proper styling
- **Safe HTML**: All output is sanitized using DOMPurify to prevent XSS attacks
- **Consistent Styling**: Tables and markdown elements styled to match the application theme

## Usage

The markdown rendering is automatically applied to all message content in the chat interface. Users and agents can send messages with markdown syntax, and it will be rendered as HTML.

### Example Markdown Content

```markdown
# Data Analysis Report

Here are the **key findings**:

| Metric | Value | Change |
|--------|-------|--------|
| Users | 1,234 | +15% |
| Revenue | $5,678 | +23% |
| Engagement | 89% | +12% |

## Summary

The data shows *positive trends* in:
- User growth
- Revenue increase 
- Engagement improvement

For technical details, see `analysis.js`.
```

### Rendered Output

The above markdown will be rendered with:
- Proper heading hierarchy (H1, H2)
- Bold and italic text formatting
- A styled data table with borders and alternating row colors
- Bulleted lists
- Inline code highlighting

## Implementation

The markdown rendering uses:
- **marked** library for markdown-to-HTML conversion
- **DOMPurify** for HTML sanitization
- Custom CSS styles for consistent theming

### For Developers

To use the markdown rendering utility in other components:

```typescript
import { renderMarkdown } from '../utils/markdown';

const htmlContent = renderMarkdown(markdownText);
// Use with dangerouslySetInnerHTML or similar
```

## Security

All rendered HTML is sanitized to prevent XSS attacks. Only safe HTML elements and attributes are allowed:
- Text formatting: `strong`, `em`, `code`, `pre`
- Structure: `h1-h6`, `p`, `ul`, `ol`, `li`, `blockquote`  
- Tables: `table`, `thead`, `tbody`, `tr`, `th`, `td`
- Links and images: `a`, `img` (with limited attributes)
- No script tags, event handlers, or dangerous content
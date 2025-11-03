/**
 * MarkdownMemory Component - Renders markdown content for world/agent descriptions and memories
 * 
 * Purpose: Display markdown content with proper formatting
 * 
 * Features:
 * - Renders markdown content including tables using react-markdown
 * - Displays memory/description data as formatted markdown
 * - Handles empty states gracefully
 * - Styled with Tailwind CSS for consistency
 * 
 * Implementation:
 * - Uses react-markdown with remark-gfm for GitHub Flavored Markdown
 * - Supports all markdown features including tables, code blocks, lists
 * - Responsive design with proper spacing
 * - Custom component styling for tables, headings, paragraphs
 * 
 * Changes:
 * - 2025-11-03: Ported from Next.js, no changes needed (pure React)
 */


import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownMemoryProps {
  content: string;
  title?: string;
  className?: string;
}

export default function MarkdownMemory({ content, title, className = '' }: MarkdownMemoryProps) {
  const contentStr = content || '';

  if (!contentStr || contentStr.trim() === '') {
    return (
      <div className={`text-muted-foreground text-sm italic ${className}`}>
        {title ? `No ${title.toLowerCase()} available` : 'No content available'}
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {title && (
        <h4 className="text-lg font-semibold text-foreground font-sans">{title}</h4>
      )}
      <div className="prose prose-sm max-w-none dark:prose-invert">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Customize table styling
            table: ({ children }) => (
              <table className="min-w-full divide-y divide-border border border-border">
                {children}
              </table>
            ),
            thead: ({ children }) => (
              <thead className="bg-muted">
                {children}
              </thead>
            ),
            th: ({ children }) => (
              <th className="px-3 py-2 text-left text-xs font-medium text-foreground uppercase tracking-wider border-r border-border last:border-r-0">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="px-3 py-2 whitespace-nowrap text-sm text-foreground border-r border-border last:border-r-0">
                {children}
              </td>
            ),
            tr: ({ children }) => (
              <tr className="even:bg-muted/50">
                {children}
              </tr>
            ),
            // Style other elements
            h1: ({ children }) => (
              <h1 className="text-xl font-bold text-foreground font-sans mb-3">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-lg font-semibold text-foreground font-sans mb-2">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-base font-medium text-foreground font-sans mb-2">
                {children}
              </h3>
            ),
            p: ({ children }) => (
              <p className="text-foreground font-sans mb-2 leading-relaxed">
                {children}
              </p>
            ),
            ul: ({ children }) => (
              <ul className="list-disc list-inside text-foreground font-sans mb-2 space-y-1">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal list-inside text-foreground font-sans mb-2 space-y-1">
                {children}
              </ol>
            ),
            li: ({ children }) => (
              <li className="text-foreground font-sans">
                {children}
              </li>
            ),
            code: ({ children }) => (
              <code className="bg-muted px-1 py-0.5 rounded text-sm font-mono text-foreground">
                {children}
              </code>
            ),
            pre: ({ children }) => (
              <pre className="bg-muted p-3 rounded-lg overflow-x-auto text-sm font-mono text-foreground mb-3">
                {children}
              </pre>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-4 border-primary pl-4 italic text-muted-foreground font-sans mb-3">
                {children}
              </blockquote>
            ),
          }}
        >
          {contentStr}
        </ReactMarkdown>
      </div>
    </div>
  );
}

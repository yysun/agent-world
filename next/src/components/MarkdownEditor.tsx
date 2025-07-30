/**
 * MarkdownEditor Component - Edits world/agent data using YAML frontmatter in textarea
 * 
 * Features:
 * - Textarea-based editing with YAML frontmatter format
 * - Real-time markdown preview below editor
 * - Save/cancel functionality with YAML parsing
 * - Error handling for invalid YAML
 * - Responsive design with proper spacing
 * 
 * Implementation:
 * - Uses gray-matter for YAML frontmatter parsing
 * - Integrates with MarkdownMemory for preview
 * - Validates YAML before saving
 * - Supports both world and agent editing
 */

import React, { useState, useEffect } from 'react';
import matter from 'gray-matter';
import MarkdownMemory from './MarkdownMemory';

interface MarkdownEditorProps {
  initialData: {
    name: string;
    description?: string;
    systemPrompt?: string;
    type?: string;
    [key: string]: unknown;
  };
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  saving?: boolean;
  entityType: 'world' | 'agent';
}

export default function MarkdownEditor({ 
  initialData, 
  onSave, 
  onCancel, 
  saving = false,
  entityType
}: MarkdownEditorProps) {
  const [yamlContent, setYamlContent] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<{ data: Record<string, unknown>; content: string } | null>(null);

  // Initialize YAML content from initial data
  useEffect(() => {
    const frontmatter = { ...initialData };
    const content = frontmatter.description || '';
    delete frontmatter.description;

    const yamlString = matter.stringify(content, frontmatter);
    setYamlContent(yamlString);
  }, [initialData]);

  // Parse YAML and update preview
  useEffect(() => {
    try {
      const parsed = matter(yamlContent);
      setPreviewData(parsed);
      setParseError(null);
    } catch (error) {
      setParseError((error as Error).message);
      setPreviewData(null);
    }
  }, [yamlContent]);

  const handleSave = async () => {
    if (parseError || !previewData) {
      return;
    }

    try {
      const data = {
        ...previewData.data,
        description: previewData.content
      };
      await onSave(data);
    } catch (error) {
      console.error('Save error:', error);
    }
  };

  const getExampleTemplate = () => {
    if (entityType === 'world') {
      return `---
name: "My World"
---

This is the world description. You can use **markdown** here including:

- Lists
- **Bold text**
- *Italic text*
- [Links](https://example.com)

## Tables

| Feature | Status |
|---------|--------|
| Chat    | ✅     |
| Agents  | ✅     |

## Code

\`\`\`javascript
console.log("Hello world");
\`\`\`
`;
    } else {
      return `---
name: "Agent Name"
type: "assistant"
systemPrompt: "You are a helpful assistant."
---

This is the agent description and memory. You can use **markdown** here.

## Agent Memory

| Date | Event |
|------|-------|
| 2024-01-01 | Created |
| 2024-01-02 | First conversation |

## Capabilities

- Answer questions
- Help with tasks
- Remember context
`;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold font-sans">
          Edit {entityType === 'world' ? 'World' : 'Agent'}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !!parseError || !previewData}
            className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2 font-sans">
            YAML Frontmatter Content
          </label>
          <textarea
            value={yamlContent}
            onChange={(e) => setYamlContent(e.target.value)}
            className="w-full h-64 px-3 py-2 text-sm font-mono border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 bg-background text-foreground resize-vertical"
            placeholder={getExampleTemplate()}
          />
          {parseError && (
            <div className="mt-2 text-sm text-red-500 font-sans">
              YAML Parse Error: {parseError}
            </div>
          )}
        </div>

        {/* Help text */}
        <div className="text-xs text-muted-foreground font-sans">
          <div className="mb-1">
            <strong>Format:</strong> YAML frontmatter (---) followed by markdown content
          </div>
          <div>
            <strong>Required fields:</strong> name{entityType === 'agent' ? ', type, systemPrompt' : ''}
          </div>
        </div>
      </div>

      {/* Preview */}
      {previewData && (
        <div className="border-t border-border pt-6">
          <h4 className="text-lg font-semibold text-foreground font-sans mb-4">Preview</h4>
          
          {/* Preview metadata */}
          <div className="bg-muted rounded-lg p-4 mb-4">
            <h5 className="text-sm font-medium text-foreground font-sans mb-2">Metadata</h5>
            <div className="space-y-1 text-sm font-mono">
              {Object.entries(previewData.data).map(([key, value]) => (
                <div key={key} className="text-foreground">
                  <span className="text-primary">{key}:</span> {JSON.stringify(value)}
                </div>
              ))}
            </div>
          </div>

          {/* Preview content */}
          <div className="border border-border rounded-lg p-4">
            <MarkdownMemory 
              content={previewData.content} 
              title="Description" 
            />
          </div>
        </div>
      )}
    </div>
  );
}
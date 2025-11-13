/**
 * MarkdownEditor Component - Form-based editor for world/agent data
 * 
 * Purpose: Simple form editor with structured fields
 * 
 * Features:
 * - Form-based editing with labeled inputs
 * - Name, description, and entity-specific fields
 * - Save/cancel functionality with validation
 * - Responsive design with proper spacing
 * 
 * Implementation:
 * - Direct state management (no parsing libraries)
 * - Validates required fields before saving
 * - Supports both world and agent editing
 * 
 * Changes:
 * - 2025-11-13: Refactored from YAML frontmatter to simple form fields, removed gray-matter dependency
 * - 2025-11-03: Ported from Next.js, removed Next.js specific imports
 */

import { useState, useEffect } from 'react';

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
  const [formData, setFormData] = useState({
    name: initialData.name || '',
    description: initialData.description || '',
    type: initialData.type || 'assistant',
    systemPrompt: initialData.systemPrompt || '',
  });
  const [validationError, setValidationError] = useState<string | null>(null);

  // Update form when initialData changes
  useEffect(() => {
    setFormData({
      name: initialData.name || '',
      description: initialData.description || '',
      type: initialData.type || 'assistant',
      systemPrompt: initialData.systemPrompt || '',
    });
  }, [initialData]);

  // Validate form data
  useEffect(() => {
    if (!formData.name.trim()) {
      setValidationError('Name is required');
    } else if (entityType === 'agent' && !formData.systemPrompt.trim()) {
      setValidationError('System prompt is required for agents');
    } else {
      setValidationError(null);
    }
  }, [formData, entityType]);

  const handleSave = async () => {
    if (validationError) {
      return;
    }

    try {
      const data: Record<string, unknown> = {
        ...initialData,
        name: formData.name.trim(),
        description: formData.description.trim(),
      };

      if (entityType === 'agent') {
        data.type = formData.type;
        data.systemPrompt = formData.systemPrompt.trim();
      }

      await onSave(data);
    } catch (error) {
      console.error('Save error:', error);
    }
  };

  const handleFieldChange = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
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
            disabled={saving || !!validationError}
            className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Form Fields */}
      <div className="flex-1 flex flex-col space-y-4 min-h-0 overflow-y-auto">
        {/* Name Field */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-foreground mb-1.5">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            type="text"
            value={formData.name}
            onChange={(e) => handleFieldChange('name', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 bg-background text-foreground"
            placeholder={entityType === 'world' ? 'My World' : 'Agent Name'}
          />
        </div>

        {/* Agent Type Field (agents only) */}
        {entityType === 'agent' && (
          <div>
            <label htmlFor="type" className="block text-sm font-medium text-foreground mb-1.5">
              Type
            </label>
            <input
              id="type"
              type="text"
              value={formData.type}
              onChange={(e) => handleFieldChange('type', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 bg-background text-foreground"
              placeholder="assistant"
            />
          </div>
        )}

        {/* System Prompt Field (agents only) */}
        {entityType === 'agent' && (
          <div className="flex-1 flex flex-col min-h-0">
            <label htmlFor="systemPrompt" className="block text-sm font-medium text-foreground mb-1.5">
              System Prompt <span className="text-red-500">*</span>
            </label>
            <textarea
              id="systemPrompt"
              value={formData.systemPrompt}
              onChange={(e) => handleFieldChange('systemPrompt', e.target.value)}
              className="w-full flex-1 min-h-[120px] px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 bg-background text-foreground resize-none"
              placeholder="You are a helpful assistant..."
            />
          </div>
        )}

        {/* Description Field */}
        <div className="flex-1 flex flex-col min-h-0">
          <label htmlFor="description" className="block text-sm font-medium text-foreground mb-1.5">
            Description
          </label>
          <textarea
            id="description"
            value={formData.description}
            onChange={(e) => handleFieldChange('description', e.target.value)}
            className="w-full flex-1 min-h-[120px] px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 bg-background text-foreground resize-none"
            placeholder={entityType === 'world'
              ? 'Describe your world...'
              : 'Describe the agent and its capabilities...'}
          />
        </div>

        {/* Validation Error */}
        {validationError && (
          <div className="text-sm text-red-500 font-sans">
            {validationError}
          </div>
        )}
      </div>
    </div>
  );
}

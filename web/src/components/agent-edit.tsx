/**
 * Agent Edit Component - Modal popup for creating and editing agents
 * 
 * Features:
 * - Functional component with no internal state
 * - Dual-purpose: create new agents and edit existing agents
 * - Modal overlay with backdrop click to close
 * - Form fields: name, description, provider, model, temperature, system prompt
 * - AppRun $ directive pattern for all event handling
 * - Props-based data flow from World component
 * 
 * Implementation:
 * - Follows WorldChat and WorldSettings functional component pattern
 * - All state managed by parent World component
 * - Uses app.run() for all events (save, cancel, delete, field updates)
 * - Conditional rendering based on isOpen prop
 * - Responsive design with mobile support
 * - Semantic HTML and proper form structure
 * 
 * Event Flow:
 * - Form field changes: app.run('update-agent-form', field, value)
 * - Save button: app.run('save-agent')
 * - Cancel button: app.run('close-agent-edit')
 * - Delete button: app.run('delete-agent') (edit mode only)
 * - Backdrop click: app.run('close-agent-edit')
 * - Escape key: handled by World component
 */

import { app } from 'apprun';
import type { Agent, AgentEditState } from '../types';

export interface AgentEditProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  selectedAgent: Agent | null;
  worldName: string;
  formData: AgentEditState['formData'];
  loading: boolean;
  error: string | null;
}
export default function AgentEdit(props: AgentEditProps) {
  const {
    isOpen,
    mode,
    selectedAgent,
    worldName,
    formData,
    loading,
    error
  } = props;

  // Guard clause - don't render if not open
  if (!isOpen) return null;

  const isEditMode = mode === 'edit';
  const title = isEditMode ? `Edit ${selectedAgent?.name || 'Agent'}` : 'Create New Agent';

  return (
    <div className="modal-backdrop" $onclick="close-agent-edit">
      <div className="modal-content" onclick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button
            className="modal-close-btn"
            $onclick="close-agent-edit"
            title="Close"
          >
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <form className="agent-form">
            {/* Basic Information Section */}
            <div className="form-section">
              <h3 className="section-title">Basic Information</h3>

              <div className="form-group">
                <label htmlFor="agent-name">Agent Name *</label>
                <input
                  id="agent-name"
                  type="text"
                  className="form-input"
                  placeholder="Enter agent name"
                  value={formData.name}
                  $oninput={['update-agent-form', 'name']}
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label htmlFor="agent-description">Description</label>
                <input
                  id="agent-description"
                  type="text"
                  className="form-input"
                  placeholder="Brief description of the agent"
                  value={formData.description}
                  $oninput={['update-agent-form', 'description']}
                  disabled={loading}
                />
              </div>
            </div>

            {/* LLM Configuration Section */}
            <div className="form-section">
              <h3 className="section-title">LLM Configuration</h3>

              <div className="form-group">
                <label htmlFor="agent-provider">Provider</label>
                <select
                  id="agent-provider"
                  className="form-select"
                  value={formData.provider}
                  $onchange={['update-agent-form', 'provider']}
                  disabled={loading}
                >
                  <option value="">Select provider</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="google">Google</option>
                  <option value="microsoft">Microsoft</option>
                  <option value="local">Local</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="agent-model">Model</label>
                <input
                  id="agent-model"
                  type="text"
                  className="form-input"
                  placeholder="e.g. gpt-4, claude-3-sonnet"
                  value={formData.model}
                  $oninput={['update-agent-form', 'model']}
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label htmlFor="agent-temperature">Temperature</label>
                <input
                  id="agent-temperature"
                  type="number"
                  className="form-input"
                  placeholder="0.0 - 2.0"
                  min="0"
                  max="2"
                  step="0.1"
                  value={formData.temperature}
                  $oninput={['update-agent-form', 'temperature']}
                  disabled={loading}
                />
              </div>
            </div>

            {/* System Prompt Section */}
            <div className="form-section">
              <h3 className="section-title">System Prompt</h3>

              <div className="form-group">
                {/* <label htmlFor="agent-prompt">System Prompt</label> */}
                <textarea
                  id="agent-prompt"
                  className="form-textarea"
                  placeholder="Enter the system prompt for this agent..."
                  rows={8}
                  value={formData.systemPrompt}
                  $oninput={['update-agent-form', 'systemPrompt']}
                  disabled={loading}
                />
              </div>
            </div>
          </form>
        </div>

        <div className="modal-footer">
          <div className="modal-actions">
            {/* Delete button - only show in edit mode */}
            {isEditMode && (
              <button
                className="btn btn-danger"
                $onclick={['delete-agent', selectedAgent?.id]}
                disabled={loading}
                title="Delete agent"
              >
                {loading ? 'Deleting...' : 'Delete'}
              </button>
            )}

            <div className="modal-primary-actions">
              <button
                className="btn btn-secondary"
                $onclick="close-agent-edit"
                disabled={loading}
              >
                Cancel
              </button>

              <button
                className="btn btn-primary"
                $onclick="save-agent"
                disabled={loading || !formData.name.trim()}
              >
                {loading ? 'Saving...' : (isEditMode ? 'Update' : 'Create')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

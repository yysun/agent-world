/**
 * World Edit Component - Modal popup for creating and editing worlds
 * 
 * Features:
 * - Functional component with no internal state
 * - Dual-purpose: create new worlds and edit existing worlds
 * - Modal overlay with backdrop click to close
 * - Form fields: name, description, turn limit
 * - AppRun $ directive pattern for all event handling
 * - Props-based data flow from parent components
 * 
 * Implementation:
 * - Follows AgentEdit functional component pattern
 * - All state managed by parent component (Home or World)
 * - Uses app.run() for all events (save, cancel, delete, field updates)
 * - Conditional rendering based on isOpen prop
 * - Responsive design with mobile support
 * - Semantic HTML and proper form structure
 * 
 * Event Flow:
 * - Form field changes: app.run('update-world-form', field, value)
 * - Save button: app.run('save-world')
 * - Cancel button: app.run('close-world-edit')
 * - Delete button: app.run('delete-world') (edit mode only)
 * - Backdrop click: app.run('close-world-edit')
 * - Escape key: handled by parent component
 */

import { app } from 'apprun';
import type { World, WorldEditState } from '../types';

export interface WorldEditProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  selectedWorld: World | null;
  formData: {
    name: string;
    description: string;
    turnLimit: number;
  };
  loading: boolean;
  error: string | null;
}

export default function WorldEdit(props: WorldEditProps) {
  const {
    isOpen,
    mode,
    selectedWorld,
    formData,
    loading,
    error
  } = props;

  // Guard clause - don't render if not open
  if (!isOpen) return null;

  const isEditMode = mode === 'edit';
  const title = isEditMode ? `Edit ${selectedWorld?.name || 'World'}` : 'Create New World';

  return (
    <div className="modal-backdrop" $onclick="close-world-edit">
      <div className="modal-content" onclick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button
            className="modal-close-btn"
            $onclick="close-world-edit"
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

          <form className="world-form">
            {/* Basic Information Section */}
            <div className="form-section">
              <h3 className="section-title">World Configuration</h3>

              <div className="form-group">
                <label htmlFor="world-name">World Name *</label>
                <input
                  id="world-name"
                  type="text"
                  className="form-input"
                  placeholder="Enter world name"
                  value={formData.name}
                  $oninput={['update-world-form', 'name']}
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label htmlFor="world-description">Description</label>
                <input
                  id="world-description"
                  type="text"
                  className="form-input"
                  placeholder="Brief description of the world"
                  value={formData.description}
                  $oninput={['update-world-form', 'description']}
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label htmlFor="world-turn-limit">Turn Limit</label>
                <input
                  id="world-turn-limit"
                  type="number"
                  className="form-input"
                  placeholder="5"
                  min="1"
                  max="50"
                  value={formData.turnLimit}
                  $oninput={['update-world-form', 'turnLimit']}
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
                $onclick={['delete-world', selectedWorld?.name]}
                disabled={loading}
                title="Delete world"
              >
                {loading ? 'Deleting...' : 'Delete'}
              </button>
            )}

            <div className="modal-primary-actions">
              <button
                className="btn btn-secondary"
                $onclick="close-world-edit"
                disabled={loading}
              >
                Cancel
              </button>

              <button
                className="btn btn-primary"
                $onclick="save-world"
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
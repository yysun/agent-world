/**
 * World Edit Component - Self-contained AppRun class component for world CRUD operations
 * 
 * Features:
 * - Self-contained class component with internal state management using mounted lifecycle
 * - Handles all three modes: create, edit, and delete worlds
 * - Module-level state update functions for easy testing and better organization
 * - Success messaging with auto-close functionality for all operations
 * - Direct function references in $on directives for better performance
 * - Modal overlay with backdrop click to close
 * - Form validation and error handling
 * 
 * Implementation:
 * - AppRun class component using mounted pattern for props-to-state initialization
 * - Module-level functions imported from world-edit-functions.ts
 * - Direct function references: $oninput={[updateField, 'name']}
 * - Global events for parent coordination: 'world-saved', 'world-deleted'
 * - Success messages shown before auto-closing modal
 * - All business logic testable independently of UI
 * 
 * Event Flow:
 * - Form field changes: $oninput={[updateField, field]}
 * - Save button: $onclick={[saveWorld]}
 * - Delete button: $onclick={[deleteWorld]}
 * - Cancel/Close: $onclick={[closeModal]}
 * - Backdrop click: $onclick={[closeModal]}
 */

import { Component } from 'apprun';
import { 
  updateField, 
  saveWorld, 
  deleteWorld, 
  closeModal, 
  initializeState,
  type WorldEditState,
  type WorldEditProps
} from './world-edit-functions';

export default class WorldEdit extends Component<WorldEditState> {
  
  mounted = (props: WorldEditProps): WorldEditState => {
    return initializeState(props);
  };

  view = (state: WorldEditState) => {
    // Success message view
    if (state.successMessage) {
      return (
        <div className="modal-backdrop" $onclick={[closeModal]}>
          <div className="modal-content" onclick={(e) => e.stopPropagation()}>
            <div className="modal-body">
              <div className="success-message">
                <h3>Success!</h3>
                <p>{state.successMessage}</p>
                <div className="loading-spinner">
                  {state.mode === 'create' ? 'Redirecting to new world...' : 
                   state.mode === 'delete' ? 'Redirecting to home...' : 'Closing...'}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    const isEditMode = state.mode === 'edit';
    const isDeleteMode = state.mode === 'delete';
    
    let title: string;
    if (isDeleteMode) {
      title = `Delete ${state.formData.name || 'World'}`;
    } else if (isEditMode) {
      title = `Edit ${state.formData.name || 'World'}`;
    } else {
      title = 'Create New World';
    }

    return (
      <div className="modal-backdrop" $onclick={[closeModal]}>
        <div className="modal-content" onclick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2 className="modal-title">{title}</h2>
            <button
              className="modal-close-btn"
              $onclick={[closeModal]}
              title="Close"
            >
              ×
            </button>
          </div>

          <div className="modal-body">
            {state.error && (
              <div className="error-message">
                {state.error}
              </div>
            )}

            {isDeleteMode ? (
              // Delete confirmation view
              <div className="delete-confirmation">
                <h3>Delete World</h3>
                <p>Are you sure you want to delete "{state.formData.name}"?</p>
                <p>This action cannot be undone and will delete all agents and messages in this world.</p>
              </div>
            ) : (
              // Form view for create and edit modes
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
                      value={state.formData.name}
                      $oninput={[updateField, 'name']}
                      disabled={state.loading}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="world-description">Description</label>
                    <input
                      id="world-description"
                      type="text"
                      className="form-input"
                      placeholder="Brief description of the world"
                      value={state.formData.description}
                      $oninput={[updateField, 'description']}
                      disabled={state.loading}
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
                      value={state.formData.turnLimit}
                      $oninput={[updateField, 'turnLimit']}
                      disabled={state.loading}
                    />
                  </div>
                </div>
              </form>
            )}
          </div>

          <div className="modal-footer">
            <div className="modal-actions">
              {isDeleteMode ? (
                // Delete mode buttons
                <div className="modal-primary-actions">
                  <button
                    className="btn btn-secondary"
                    $onclick={[closeModal]}
                    disabled={state.loading}
                  >
                    Cancel
                  </button>

                  <button
                    className="btn btn-danger"
                    $onclick={[deleteWorld]}
                    disabled={state.loading}
                  >
                    {state.loading ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              ) : (
                // Create/Edit mode buttons
                <>
                  {/* Delete button - only show in edit mode */}
                  {isEditMode && (
                    <button
                      className="btn btn-danger"
                      $onclick={[deleteWorld]}
                      disabled={state.loading}
                      title="Delete world"
                    >
                      {state.loading ? 'Deleting...' : 'Delete'}
                    </button>
                  )}

                  <div className="modal-primary-actions">
                    <button
                      className="btn btn-secondary"
                      $onclick={[closeModal]}
                      disabled={state.loading}
                    >
                      Cancel
                    </button>

                    <button
                      className="btn btn-primary"
                      $onclick={[saveWorld]}
                      disabled={state.loading || !state.formData.name.trim()}
                    >
                      {state.loading ? 'Saving...' : (isEditMode ? 'Update' : 'Create')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };
}
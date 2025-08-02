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
 * - Module-level functions defined in same file for consolidation
 * - Direct function references: $onclick={[saveWorld]}
 * - Success messages shown before auto-closing modal
 * - All business logic testable independently of UI
 * 
 * Event Flow:
 * - Form field changes: $bind="world.name"
 * - Save button: $onclick={[saveWorld]}
 * - Delete button: $onclick={[deleteWorld]}
 * - Cancel/Close: $onclick={[closeModal]}
 * - Backdrop click: $onclick={[closeModal]}
 */

import { app, Component } from 'apprun';
import type { World } from '../types';
import api from '../api';

// Props interface for the component initialization
interface WorldEditProps {
  world?: World | null;
  mode?: 'create' | 'edit' | 'delete';
  parentComponent?: any;
}

// Initialize component state from props
const getStateFromProps = (props: WorldEditProps): WorldEditState => ({
  mode: props.mode || 'create',
  world: props.world || getDefaultWorldData(),
  parentComponent: props.parentComponent,
  loading: false,
});

// Helper function to get default world data
const getDefaultWorldData = (): Partial<World> => ({
  name: '',
  description: '',
  turnLimit: 5
});

export interface WorldEditState {
  mode: 'create' | 'edit' | 'delete';
  world: Partial<World>;
  parentComponent?: any;
  loading: boolean;
  error?: string | null;
  successMessage?: string | null;
}

// Save world function (handles both create and update)
export const saveWorld = async function* (state: WorldEditState): AsyncGenerator<WorldEditState> {
  // Form validation
  if (!state.world.name.trim()) {
    yield { ...state, error: 'World name is required' };
    return;
  }

  // Set loading state
  yield { ...state, loading: true, error: null };

  try {
    if (state.mode === 'create') {
      await api.createWorld(state.world);
    } else {
      // For update, we need the original world name, which should be preserved from initialization
      await api.updateWorld(state.world.name, state.world);
    }

    const successMessage = state.mode === 'create'
      ? 'World created successfully!'
      : 'World updated successfully!';

    // Show success message
    yield { ...state, loading: false, successMessage };

    // Auto-close after showing success message
    setTimeout(() => {
      if (state.mode === 'create') {
        // Redirect to new world
        window.location.href = '/World/' + encodeURIComponent(state.world.name);
      } else {
        // For edit mode, reload to refresh all data
        location.reload();
      }
    }, 2000);

  } catch (error: any) {
    yield {
      ...state,
      loading: false,
      error: error.message || 'Failed to save world'
    };
  }
};

// Delete world function
export const deleteWorld = async function* (state: WorldEditState): AsyncGenerator<WorldEditState> {
  // Set loading state
  yield { ...state, loading: true, error: null };

  try {
    await api.deleteWorld(state.world.name);

    // Show success message
    yield {
      ...state,
      loading: false,
      successMessage: 'World deleted successfully!'
    };

    // Auto-close and redirect to home after showing success message
    setTimeout(() => {
      location.reload();
    }, 2000);

  } catch (error: any) {
    yield {
      ...state,
      loading: false,
      error: error.message || 'Failed to delete world'
    };
  }
};

// Close modal function
export const closeModal = (state?: WorldEditState): void => {
  if (state?.parentComponent && typeof state.parentComponent.run === 'function') {
    state.parentComponent.run('close-world-edit');
  } else {
    app.run('close-world-edit');
  }
};

export default class WorldEdit extends Component<WorldEditState> {
  declare props: Readonly<WorldEditProps>;
  mounted = (props: WorldEditProps): WorldEditState => getStateFromProps(props);

  state: WorldEditState = {
    mode: 'create' as const,
    world: getDefaultWorldData(),
    parentComponent: undefined,
    loading: false,
    error: null,
    successMessage: null
  };

  view = (state: WorldEditState) => {
    // Success message view
    if (state.successMessage) {
      return (
        <div className="modal-backdrop" $onclick={closeModal}>
          <div className="modal-content" onclick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Success!</h2>
              <button
                className="modal-close-btn"
                $onclick={closeModal}
                title="Close"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="success-message">
                <p>{state.successMessage}</p>
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
      title = `Delete ${state.world.name || 'World'}`;
    } else if (isEditMode) {
      title = `Edit ${state.world.name || 'World'}`;
    } else {
      title = 'Create New World';
    }

    return (
      <div className="modal-backdrop" $onclick={closeModal}>
        <div className="modal-content" onclick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2 className="modal-title">{title}</h2>
            <button
              className="modal-close-btn"
              $onclick={closeModal}
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
                <p className="delete-confirmation-text">Are you sure you want to delete <span className="delete-confirmation-name">"{state.world.name}"</span>?</p>
                <p className="delete-confirmation-text">This action cannot be undone and will delete all agents and messages in this world.</p>
              </div>
            ) : (
              // Form view for create and edit modes
              <form className="world-form">
                {/* Basic Information Section */}
                <div className="form-section">

                  <div className={`form-group ${isEditMode ? 'hidden' : ''}`}>
                    <label htmlFor="world-name">World Name *</label>
                    <input
                      id="world-name"
                      type="text"
                      className="form-input"
                      placeholder="Enter world name"
                      value={state.world.name}
                      $bind="world.name"
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
                      value={state.world.description}
                      $bind="world.description"
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
                      value={state.world.turnLimit}
                      $bind="world.turnLimit"
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
                // Delete mode buttons - align to right like create mode
                <div className="modal-primary-actions" style="margin-left: auto;">
                  <button
                    className="btn btn-secondary"
                    $onclick={closeModal}
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
              ) : isEditMode ? (
                // Edit mode buttons - delete on left, primary actions on right
                <>
                  <button
                    className="btn btn-danger"
                    $onclick={[deleteWorld]}
                    disabled={state.loading}
                    title="Delete world"
                  >
                    {state.loading ? 'Deleting...' : 'Delete'}
                  </button>

                  <div className="modal-primary-actions">
                    <button
                      className="btn btn-secondary"
                      $onclick={closeModal}
                      disabled={state.loading}
                    >
                      Cancel
                    </button>

                    <button
                      className="btn btn-primary"
                      $onclick={[saveWorld]}
                      disabled={state.loading || !state.world.name.trim()}
                    >
                      {state.loading ? 'Saving...' : 'Update'}
                    </button>
                  </div>
                </>
              ) : (
                // Create mode buttons - align to right with margin-left: auto
                <div className="modal-primary-actions" style="margin-left: auto;">
                  <button
                    className="btn btn-secondary"
                    $onclick={closeModal}
                    disabled={state.loading}
                  >
                    Cancel
                  </button>

                  <button
                    className="btn btn-primary"
                    $onclick={[saveWorld]}
                    disabled={state.loading || !state.world.name.trim()}
                  >
                    {state.loading ? 'Saving...' : 'Create'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };
}
/**
 * Agent Panel Content
 * Purpose:
 * - Render create/edit agent forms inside the shell right panel.
 *
 * Key Features:
 * - Shares the agent field form across create and edit modes.
 * - Preserves prompt-editor expansion hooks and panel action bars.
 * - Supports delete actions in edit mode.
 *
 * Implementation Notes:
 * - The shell chooses which panel mode to render; this component owns the agent-specific body.
 *
 * Recent Changes:
 * - 2026-04-19: Extracted from the shell right-panel catch-all into the agents feature.
 */

import { PanelActionBar } from '../../../design-system/patterns';
import { AGENT_PROVIDER_OPTIONS } from '../../../constants/app-defaults';
import { AgentFormFields } from './index';

export default function AgentPanelContent({
  panelMode,
  loadedWorld,
  selectedAgentForPanel,
  onCreateAgent,
  creatingAgent,
  setCreatingAgent,
  onOpenAgentPromptEditor,
  savingAgent,
  onUpdateAgent,
  editingAgent,
  setEditingAgent,
  deletingAgent,
  onDeleteAgent,
  closePanel,
}) {
  if (panelMode === 'create-agent' && loadedWorld) {
    return (
      <form onSubmit={onCreateAgent} className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <AgentFormFields
            agent={creatingAgent}
            setAgent={setCreatingAgent}
            disabled={savingAgent}
            providerOptions={AGENT_PROVIDER_OPTIONS}
            onExpandPrompt={() => onOpenAgentPromptEditor('create')}
          />
        </div>
        <PanelActionBar>
          <button
            type="button"
            onClick={closePanel}
            disabled={savingAgent}
            className="rounded-xl border border-sidebar-border px-3 py-1 text-xs text-sidebar-foreground hover:bg-sidebar-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={savingAgent}
            className="rounded-xl bg-sidebar-primary px-3 py-1 text-xs font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingAgent ? 'Creating...' : 'Create'}
          </button>
        </PanelActionBar>
      </form>
    );
  }

  if (panelMode === 'edit-agent' && loadedWorld && selectedAgentForPanel) {
    return (
      <form onSubmit={onUpdateAgent} className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <AgentFormFields
            agent={editingAgent}
            setAgent={setEditingAgent}
            disabled={savingAgent || deletingAgent}
            providerOptions={AGENT_PROVIDER_OPTIONS}
            onExpandPrompt={() => onOpenAgentPromptEditor('edit')}
          />
        </div>
        <PanelActionBar
          leading={(
            <button
              type="button"
              onClick={onDeleteAgent}
              disabled={savingAgent || deletingAgent}
              className="rounded-xl border border-destructive/40 px-3 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Delete
            </button>
          )}
        >
          <button
            type="button"
            onClick={closePanel}
            disabled={savingAgent || deletingAgent}
            className="rounded-xl border border-sidebar-border px-3 py-1 text-xs text-sidebar-foreground hover:bg-sidebar-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={savingAgent || deletingAgent}
            className="rounded-xl bg-sidebar-primary px-3 py-1 text-xs font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingAgent ? 'Saving...' : deletingAgent ? 'Deleting...' : 'Save'}
          </button>
        </PanelActionBar>
      </form>
    );
  }

  return null;
}

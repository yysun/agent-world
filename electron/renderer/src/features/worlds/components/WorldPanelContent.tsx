/**
 * World Panel Content
 * Purpose:
 * - Render create/edit world forms inside the shell right panel.
 *
 * Key Features:
 * - Supports create-world and edit-world modes.
 * - Preserves heartbeat and expanded text-editor affordances.
 * - Keeps world form ownership inside the worlds feature.
 *
 * Implementation Notes:
 * - The shell selects the panel mode; this component owns the world-specific body.
 *
 * Recent Changes:
 * - 2026-04-19: Extracted from the shell right-panel catch-all into the worlds feature.
 */

import { PanelActionBar, LabeledField } from '../../../design-system/patterns';
import { Checkbox, Input, Select, Textarea } from '../../../design-system/primitives';
import { MIN_TURN_LIMIT, WORLD_PROVIDER_OPTIONS } from '../../../constants/app-defaults';

function WorldTextFieldButton({ label, value, onOpen, disabled, buttonTitle }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground">
      <span>{label}: {String(value || '').trim() ? 'Configured' : 'Not configured'}</span>
      <button
        type="button"
        onClick={onOpen}
        className="rounded p-1 text-sidebar-foreground/50 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
        title={buttonTitle}
        disabled={disabled}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

export default function WorldPanelContent({
  panelMode,
  loadedWorld,
  onUpdateWorld,
  editingWorld,
  setEditingWorld,
  updatingWorld,
  deletingWorld,
  onOpenWorldTextEditor,
  onDeleteWorld,
  closePanel,
  onCreateWorld,
  creatingWorld,
  setCreatingWorld,
}) {
  if (panelMode === 'edit-world' && loadedWorld) {
    return (
      <form onSubmit={onUpdateWorld} className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          <LabeledField label="World Name">
            <div className="rounded-md border border-sidebar-border bg-sidebar px-3 py-2 text-xs text-sidebar-foreground/80">
              {editingWorld.name}
            </div>
          </LabeledField>
          <LabeledField label="Description">
            <Textarea
              value={editingWorld.description}
              onChange={(event) => setEditingWorld((value) => ({ ...value, description: event.target.value }))}
              placeholder="Description (optional)"
              tone="sidebar"
              className="h-20"
              disabled={updatingWorld || deletingWorld}
            />
          </LabeledField>
          <div className="grid grid-cols-2 gap-2">
            <LabeledField label="LLM Provider">
              <Select
                value={editingWorld.chatLLMProvider}
                onChange={(event) => setEditingWorld((value) => ({ ...value, chatLLMProvider: event.target.value }))}
                tone="sidebar"
                disabled={updatingWorld || deletingWorld}
              >
                <option value="">Select provider</option>
                {WORLD_PROVIDER_OPTIONS.map((provider) => (
                  <option key={provider.value} value={provider.value}>
                    {provider.label}
                  </option>
                ))}
              </Select>
            </LabeledField>
            <LabeledField label="LLM model">
              <Input
                value={editingWorld.chatLLMModel}
                onChange={(event) => setEditingWorld((value) => ({ ...value, chatLLMModel: event.target.value }))}
                placeholder="Chat LLM model"
                tone="sidebar"
                disabled={updatingWorld || deletingWorld}
              />
            </LabeledField>
          </div>
          <LabeledField label="Turn Limit">
            <Input
              type="number"
              min={MIN_TURN_LIMIT}
              max="50"
              value={editingWorld.turnLimit}
              onChange={(event) => setEditingWorld((value) => ({ ...value, turnLimit: Number(event.target.value) || MIN_TURN_LIMIT }))}
              tone="sidebar"
              disabled={updatingWorld || deletingWorld}
            />
          </LabeledField>
          <LabeledField label="Main Agent">
            <Input
              value={editingWorld.mainAgent}
              onChange={(event) => setEditingWorld((value) => ({ ...value, mainAgent: event.target.value }))}
              placeholder="Main agent (optional)"
              tone="sidebar"
              disabled={updatingWorld || deletingWorld}
            />
          </LabeledField>
          <div className="rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-sidebar-foreground/90">Heartbeat</label>
              <Checkbox
                checked={editingWorld.heartbeatEnabled === true}
                onChange={(event) => setEditingWorld((value) => ({ ...value, heartbeatEnabled: event.target.checked }))}
                disabled={updatingWorld || deletingWorld}
              />
            </div>
            {editingWorld.heartbeatEnabled === true ? (
              <div className="mt-2 flex flex-col gap-2">
                <LabeledField label="Interval">
                  <Input
                    value={editingWorld.heartbeatInterval || ''}
                    onChange={(event) => setEditingWorld((value) => ({ ...value, heartbeatInterval: event.target.value }))}
                    placeholder="*/5 * * * *"
                    tone="sidebar"
                    className="bg-sidebar"
                    disabled={updatingWorld || deletingWorld}
                  />
                  <span className="text-[11px] text-sidebar-foreground/70">Standard 5-field cron format</span>
                </LabeledField>
                <LabeledField label="Prompt">
                  <Textarea
                    value={editingWorld.heartbeatPrompt || ''}
                    onChange={(event) => setEditingWorld((value) => ({ ...value, heartbeatPrompt: event.target.value }))}
                    placeholder="Message to send on each heartbeat"
                    tone="sidebar"
                    className="h-20 bg-sidebar"
                    disabled={updatingWorld || deletingWorld}
                  />
                </LabeledField>
              </div>
            ) : null}
          </div>
          <WorldTextFieldButton
            label="Variables (.env)"
            value={editingWorld.variables}
            onOpen={() => onOpenWorldTextEditor('variables')}
            disabled={updatingWorld || deletingWorld}
            buttonTitle="Expand variables editor"
          />
          <WorldTextFieldButton
            label="MCP Config"
            value={editingWorld.mcpConfig}
            onOpen={() => onOpenWorldTextEditor('mcpConfig')}
            disabled={updatingWorld || deletingWorld}
            buttonTitle="Expand MCP editor"
          />
        </div>
        <PanelActionBar
          leading={(
            <button
              type="button"
              onClick={onDeleteWorld}
              disabled={deletingWorld || updatingWorld}
              className="rounded-xl border border-destructive/40 px-3 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Delete
            </button>
          )}
        >
          <button
            type="button"
            onClick={closePanel}
            disabled={updatingWorld || deletingWorld}
            className="rounded-xl border border-sidebar-border px-3 py-1 text-xs text-sidebar-foreground hover:bg-sidebar-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={updatingWorld || deletingWorld}
            className="rounded-xl bg-sidebar-primary px-3 py-1 text-xs font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save
          </button>
        </PanelActionBar>
      </form>
    );
  }

  return (
    <form onSubmit={onCreateWorld} className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
        <LabeledField label="World Name">
          <Input
            value={creatingWorld.name}
            onChange={(event) => setCreatingWorld((value) => ({ ...value, name: event.target.value }))}
            placeholder="World name"
            tone="sidebar"
          />
        </LabeledField>
        <LabeledField label="Description">
          <Textarea
            value={creatingWorld.description}
            onChange={(event) => setCreatingWorld((value) => ({ ...value, description: event.target.value }))}
            placeholder="Description (optional)"
            tone="sidebar"
            className="h-20"
          />
        </LabeledField>
        <div className="grid grid-cols-2 gap-2">
          <LabeledField label="LLM Provider">
            <Select
              value={creatingWorld.chatLLMProvider}
              onChange={(event) => setCreatingWorld((value) => ({ ...value, chatLLMProvider: event.target.value }))}
              tone="sidebar"
            >
              <option value="">Select provider</option>
              {WORLD_PROVIDER_OPTIONS.map((provider) => (
                <option key={provider.value} value={provider.value}>
                  {provider.label}
                </option>
              ))}
            </Select>
          </LabeledField>
          <LabeledField label="LLM model">
            <Input
              value={creatingWorld.chatLLMModel}
              onChange={(event) => setCreatingWorld((value) => ({ ...value, chatLLMModel: event.target.value }))}
              placeholder="Chat LLM model"
              tone="sidebar"
            />
          </LabeledField>
        </div>
        <LabeledField label="Turn Limit">
          <Input
            type="number"
            min={MIN_TURN_LIMIT}
            max="50"
            value={creatingWorld.turnLimit}
            onChange={(event) => setCreatingWorld((value) => ({ ...value, turnLimit: Number(event.target.value) || MIN_TURN_LIMIT }))}
            tone="sidebar"
          />
        </LabeledField>
        <LabeledField label="Main Agent">
          <Input
            value={creatingWorld.mainAgent}
            onChange={(event) => setCreatingWorld((value) => ({ ...value, mainAgent: event.target.value }))}
            placeholder="Main agent (optional)"
            tone="sidebar"
          />
        </LabeledField>
      </div>
      <PanelActionBar>
        <button
          type="button"
          onClick={closePanel}
          className="rounded-xl border border-sidebar-border px-3 py-1 text-xs text-sidebar-foreground hover:bg-sidebar-accent"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-xl bg-sidebar-primary px-3 py-1 text-xs font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
        >
          Create
        </button>
      </PanelActionBar>
    </form>
  );
}

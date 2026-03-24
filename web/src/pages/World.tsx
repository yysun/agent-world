/**
 * World Component - Real-time world interface with agents and chat
 *
 * Features:
 * - Centered agent list with message badges and real-time SSE chat streaming
 * - Responsive right panel behavior (desktop side-by-side, tablet/mobile toggle surface)
 * - Agent selection highlighting with message filtering and CRUD modals
 * - AppRun MVU pattern with modular components and extracted handlers
 * - Tailwind CSS utilities for layout, spacing, and responsive design
 * 
 * Implementation:
 * - Flexbox layout with Tailwind utilities
 * - Responsive grid and spacing with Tailwind classes
 * - Preserves Doodle CSS for buttons and decorative elements
 * - Custom CSS for agent sprites, animations, and message styling
 * 
 * Recent Changes:
 * - 2026-03-13: Passed world-scoped reasoning-effort selection into chat and dashboard composers.
 * - 2026-03-11: Made right-panel close actions resolve against the live viewport width so the mobile close button still works after viewport mismatches.
 * - 2026-03-11: Reduced the world-page top inset so the compressed agent row sits closer to the viewport edge.
 * - 2026-03-11: Compressed the top world row by driving agent-strip height, sprite size, and action-button size from shared viewport vars.
 * - 2026-03-11: Switched the top agent list to a single-row horizontal strip with viewport-tuned spacing vars.
 * - 2026-03-11: Passed viewport mode into chat and history surfaces so responsive control sizing follows the active layout mode.
 * - 2026-03-11: Wired chat-history search state through the World page so the sidebar filter input updates visible chats.
 * - 2026-03-11: Scoped visible HITL prompts to the active chat so pending approvals survive chat switches without
 *   leaking into other chat views.
 * - 2026-03-10: Added stable world-page and error-state selectors for Playwright web E2E coverage.
 * - 2026-02-27: Removed stale HITL modal wording; web HITL prompts are inline chat-flow cards.
 * - 2026-02-21: Moved mobile world action buttons into the right-panel header row so they align with the close button.
 * - 2026-02-21: Removed mobile Chats/World tabs, kept world action buttons pinned at the top of the panel, and simplified right-panel content visibility.
 * - 2026-02-22: Added responsive right-panel state/toggle/tabs with desktop side panel + tablet/mobile overlay behaviors.
 * - 2026-02-21: Passed selected project-folder context into chat composer for Electron-style `Project` button parity.
 * - 2026-02-20: Moved HITL prompts from modal overlays to inline chat-flow cards (options-only).
 * - 2026-02-20: Highlighted the world main agent in the top agent row.
 * - 2026-02-14: Added generic HITL option prompt wiring with web response submission support.
 * - 2026-02-14: Added web send/stop composer wiring via `currentChatId` and `isStopping` props.
 * - 2026-02-08: Removed legacy manual tool-intervention dialog rendering and state wiring
 * - 2026-02-08: Pass world agents into WorldChat for correct per-agent message avatars
 * - Integrated Tailwind CSS utilities for layout and spacing
 * - Added flexbox utilities for component structure
 * - Migrated modal overlays to Tailwind positioning
 * - Preserved agent sprites and animation CSS
 * - Maintained Doodle borders on buttons and fieldsets
 */

import { app, Component, safeHTML } from 'apprun';
import type { WorldComponentState, Agent, RightPanelTab, WorldViewportMode } from '../types';
import type { WorldEventName } from '../types/events';
import {
  AgentEdit,
  WorldChat,
  WorldChatHistory,
  WorldDashboard,
  getAgentStripCssVars,
  WorldEdit,
  getAgentStripStyleAttribute,
  getInitialViewportMode,
  getViewportMode,
  resolveRightPanelViewportMode,
  worldRouteUiHandlers,
  worldUpdateHandlers,
} from '../features/world';
import { selectHitlPromptForChat } from '../domain/hitl';
import { getEnvValueFromText, getReasoningEffortLevel } from '../domain/world-variables';
import { ActionButton, CenteredStatePanel, IconActionButton, ModalShell } from '../patterns';

export {
  getAgentStripCssVars,
  getAgentStripStyleAttribute,
  getInitialViewportMode,
  getViewportMode,
  resolveRightPanelViewportMode,
};

function isWorldMainAgent(agent: Agent, worldMainAgent: string | null | undefined): boolean {
  const normalizedMainAgent = String(worldMainAgent || '').trim().toLowerCase();
  if (!normalizedMainAgent) return false;

  const normalizedAgentId = String(agent?.id || '').trim().toLowerCase();
  const normalizedAgentName = String(agent?.name || '').trim().toLowerCase();
  return normalizedMainAgent === normalizedAgentId || normalizedMainAgent === normalizedAgentName;
}

export default class WorldComponent extends Component<WorldComponentState, WorldEventName> {
  //                                                   ^^^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^
  //                                                   State type           Event type (AppRun native typed events)

  private readonly handleViewportChange = () => {
    if (typeof window === 'undefined') return;
    app.run('sync-right-panel-viewport', { width: window.innerWidth });
  };

  private readonly initialViewportMode = getInitialViewportMode();

  override state = {
    worldName: 'World',
    world: null,
    messages: [],
    userInput: '',
    loading: true,
    error: null,
    messagesLoading: false,
    isSending: false,
    isStopping: false,
    isWaiting: false,
    selectedSettingsTarget: 'chat' as const,
    selectedAgent: null,
    activeAgent: null,
    showAgentEdit: false,
    agentEditMode: 'create' as const,
    selectedAgentForEdit: null,
    showWorldEdit: false,
    worldEditMode: 'edit' as const,
    selectedWorldForEdit: null,
    chatToDelete: null,
    connectionStatus: 'disconnected',
    needScroll: false,  // Always false by default, set true only when new content added
    currentChat: null,
    chatSearchQuery: '',
    selectedProjectPath: null,
    systemStatus: null,
    systemStatusTimerId: null,
    editingMessageId: null,
    editingText: '',
    messageToDelete: null,
    activeAgentFilters: [] as string[],  // Per-agent badge toggle filter state
    agentActivities: {},

    // Streaming state (Phase 1)
    pendingStreamUpdates: new Map<string, string>(),
    debounceFrameId: null,

    // Activity state (Phase 1)
    activeTools: [],
    isBusy: false,
    elapsedMs: 0,
    activityStartTime: null,
    elapsedIntervalId: null,

    // HITL approval prompt state
    hitlPromptQueue: [],
    submittingHitlRequestId: null,

    // Dashboard state
    dashboardZoneContent: new Map(),
    dashboardShowHistory: false,

    // Responsive right-panel state
    rightPanelTab: 'chats' as RightPanelTab,
    isRightPanelOpen: this.initialViewportMode === 'desktop',
    viewportMode: this.initialViewportMode,
  };

  override view = (state: WorldComponentState) => {
    const activeHitlPrompt = selectHitlPromptForChat(state.hitlPromptQueue || [], state.currentChat?.id || null);
    const isDesktopViewport = state.viewportMode === 'desktop';
    const isRightPanelOpen = isDesktopViewport ? true : state.isRightPanelOpen;
    const reasoningEffort = getReasoningEffortLevel(state.world?.variables);

    if (state.error) {
      return (
        <div className="world-container flex flex-col h-screen" data-testid="world-page">
          <div className="world-columns flex flex-1 overflow-hidden">
            <div className="chat-column flex flex-col flex-1">
              <div className="agents-section">
                <div className="agents-row flex items-center gap-4 px-4 py-2">
                  <div className="text-text-secondary">Error</div>
                </div>
              </div>
              <div className="error-state flex items-center justify-center flex-1 p-4" data-testid="world-error-state">
                <CenteredStatePanel
                  title="Error loading world"
                  body={`Error: ${state.error}`}
                  actions={[{ label: 'Retry', className: 'btn btn-primary px-6 py-3', $onclick: ['/World', state.worldName] }]}
                />
              </div>
            </div>
            <div className="settings-column w-96">
              <div className="settings-section p-4">
                <div className="settings-row flex gap-2">
                  <IconActionButton className="world-settings-btn" title="World Settings" label={<span className="world-gear-icon">⚙</span>} />
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Main content view
    return (
      <div
        className={`world-container flex flex-col h-screen viewport-${state.viewportMode}`}
        data-testid="world-page"
        style={getAgentStripStyleAttribute(state.viewportMode)}
      >
        <div className="world-columns flex flex-1 overflow-hidden">
          <div className="chat-column flex flex-col flex-1">
            <div className="agents-section">
              <div className="agents-row agents-row-with-back flex items-center gap-4 px-4 py-2">
                <div className="back-button-container">
                  <a href="/">
                    <IconActionButton className="back-button flex items-center justify-center" title="Back to Worlds" label={<span className="world-back-icon">←</span>} />
                  </a>
                </div>
                <div
                  className="agents-list-container flex-1"
                  data-testid="agent-strip-container"
                >
                  {!state.world?.agents?.length ? (
                    <div className="no-agents text-text-secondary">No agents in this world:
                      <span> {safeHTML('<a href="#" onclick="app.run(\'open-agent-create\')">Create Agent</a>')}</span>
                    </div>
                  ) : (
                    <div className="agents-list" data-testid="agent-strip">
                      {state.world?.agents.map((agent, index) => {
                        const isSelected = state.selectedSettingsTarget === 'agent' && state.selectedAgent?.id === agent.id;
                        const isFilterActive = state.activeAgentFilters.includes(agent.id);
                        const isMainAgent = isWorldMainAgent(agent, state.world?.mainAgent);
                        return (
                          <div
                            key={`agent-${agent.id || index}`}
                            className={`agent-item ${isSelected ? 'selected' : ''} ${isMainAgent ? 'main-agent' : ''} flex flex-col items-center gap-1 px-4 cursor-pointer`}
                            $onclick={['open-agent-edit', agent]}
                          >
                            <div className="agent-sprite-container relative">
                              <div className={`agent-sprite sprite-${agent.spriteIndex} w-16 h-16`}></div>
                              {isMainAgent ? (
                                <div className="main-agent-badge absolute" title="Main agent">
                                  MAIN
                                </div>
                              ) : null}
                              <div
                                className={`message-badge ${isFilterActive ? 'active' : ''} absolute`}
                                $onclick={['toggle-agent-filter', agent.id]}
                              >
                                {agent.messageCount}
                              </div>
                            </div>
                            <div className="agent-name text-sm text-center">{agent.name}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                {!isDesktopViewport ? (
                  <div className="right-panel-toggle-container">
                    <IconActionButton
                      className="world-settings-btn right-panel-toggle"
                      title="Open chats and world actions"
                      aria-label="Open chats and world actions"
                      $onclick="toggle-right-panel"
                      label={<span className="world-gear-icon">☰</span>}
                    />
                  </div>
                ) : null}
              </div>
            </div>

            {state.world?.uiMode === 'dashboard' && !state.dashboardShowHistory ? (
              <WorldDashboard
                worldName={state.worldName}
                currentChatId={state.currentChat?.id || null}
                messages={state.messages}
                userInput={state.userInput}
                isSending={state.isSending}
                isWaiting={state.isWaiting}
                isStopping={state.isStopping}
                isBusy={state.isBusy || state.isWaiting}
                dashboardZones={state.world?.dashboardZones || []}
                dashboardZoneContent={state.dashboardZoneContent}
                dashboardShowHistory={state.dashboardShowHistory}
                activeHitlPrompt={activeHitlPrompt}
                submittingHitlRequestId={state.submittingHitlRequestId}
                reasoningEffort={reasoningEffort}
              />
            ) : (
              <WorldChat
                worldName={state.worldName}
                messages={state.messages}
                rawMessages={state.rawMessages}
                userInput={state.userInput}
                messagesLoading={state.messagesLoading}
                isSending={state.isSending}
                isWaiting={state.isWaiting}
                needScroll={state.needScroll}
                activeAgent={state.activeAgent}
                agents={state.world?.agents || []}
                selectedAgent={state.selectedSettingsTarget === 'agent' ? state.selectedAgent : null}
                currentChat={state.currentChat?.name}
                currentChatId={state.currentChat?.id || null}
                selectedProjectPath={state.selectedProjectPath}
                systemStatus={state.systemStatus}
                reasoningEffort={reasoningEffort}
                toolPermission={(getEnvValueFromText(state.world?.variables, 'tool_permission') as 'read' | 'ask' | 'auto') || 'auto'}
                editingMessageId={state.editingMessageId}
                editingText={state.editingText}
                agentFilters={state.activeAgentFilters}
                isBusy={state.isBusy || state.isWaiting}
                elapsedMs={state.elapsedMs}
                activeTools={state.activeTools}
                isStopping={state.isStopping}
                activeHitlPrompt={activeHitlPrompt}
                submittingHitlRequestId={state.submittingHitlRequestId}
                viewportMode={state.viewportMode}
              />
            )}
          </div>

          <div className={`settings-column world-right-panel ${isRightPanelOpen ? 'is-open' : 'is-closed'} ${state.viewportMode}-panel`}>
            <div className="right-panel-mobile-header">
              <div className="right-panel-mobile-actions">
                <IconActionButton
                  className="world-settings-btn"
                  title="Create New Agent"
                  $onclick="open-agent-create"
                  label={<span className="world-gear-icon">+</span>}
                />
                <IconActionButton
                  className="world-settings-btn"
                  title="World Settings"
                  $onclick="open-world-edit"
                  label={<span className="world-gear-icon">⚙</span>}
                />
                <IconActionButton
                  className="world-settings-btn"
                  $onclick={['export-world-markdown', { worldName: state.world?.name }]}
                  title="Export world to markdown file"
                  label={<span className="world-gear-icon">↓</span>}
                />
                <IconActionButton
                  className="world-settings-btn"
                  $onclick={['view-world-markdown', { worldName: state.world?.name }]}
                  title="View world markdown in new tab"
                  label={<span className="world-gear-icon">&#x1F5CE;</span>}
                />
              </div>
              <IconActionButton
                className="world-settings-btn right-panel-close"
                title="Close panel"
                aria-label="Close panel"
                $onclick="close-right-panel"
                label={<span className="world-gear-icon">×</span>}
              />
            </div>

            {isDesktopViewport ? (
              <div className="settings-section p-4 world-panel-world-actions">
                <div className="settings-row flex gap-2">
                  <IconActionButton
                    className="world-settings-btn"
                    title="Create New Agent"
                    $onclick="open-agent-create"
                    label={<span className="world-gear-icon">+</span>}
                  />
                  <IconActionButton
                    className="world-settings-btn"
                    title="World Settings"
                    $onclick="open-world-edit"
                    style={{ marginLeft: '8px' }}
                    label={<span className="world-gear-icon">⚙</span>}
                  />
                  <IconActionButton
                    className="world-settings-btn"
                    $onclick={['export-world-markdown', { worldName: state.world?.name }]}
                    title="Export world to markdown file"
                    style={{ marginLeft: '8px' }}
                    label={<span className="world-gear-icon">↓</span>}
                  />
                  <IconActionButton
                    className="world-settings-btn"
                    $onclick={['view-world-markdown', { worldName: state.world?.name }]}
                    title="View world markdown in new tab"
                    style={{ marginLeft: '4px' }}
                    label={<span className="world-gear-icon">&#x1F5CE;</span>}
                  />
                </div>
              </div>
            ) : null}

            <div className="world-panel-chats-section">
              <WorldChatHistory
                world={state.world}
                chatSearchQuery={state.chatSearchQuery}
                viewportMode={state.viewportMode}
              />
            </div>
          </div>
        </div>

        {!isDesktopViewport && isRightPanelOpen ? (
          <ActionButton
            className="world-panel-backdrop"
            aria-label="Close panel"
            $onclick="close-right-panel"
          />
        ) : null}

        {state.showAgentEdit &&
          <AgentEdit
            agent={state.selectedAgentForEdit}
            mode={state.agentEditMode}
            worldName={state.worldName}
            parentComponent={this}
          />
        }

        {state.showWorldEdit &&
          <WorldEdit
            world={state.selectedWorldForEdit}
            mode={state.worldEditMode}
            parentComponent={this}
          />
        }

        {/* Chat Delete Confirmation Modal */}
        {state.chatToDelete && (
          <ModalShell
            title="Delete Chat"
            overlayClassName="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            overlayAttrs={{ $onclick: 'chat-history-hide-modals' }}
            contentClassName="modal-content chat-history-modal bg-white rounded-lg p-6 max-w-md"
            contentAttrs={{ onclick: (e: Event) => e.stopPropagation() }}
            closeButtonClassName="modal-close-btn absolute top-4 right-4 text-2xl"
            closeAttrs={{ $onclick: 'chat-history-hide-modals' }}
            footer={(
              <div className="form-actions flex gap-2 justify-end">
                <ActionButton
                  className="btn-danger px-4 py-2 rounded"
                  $onclick={['delete-chat-from-history', { chatId: state.chatToDelete.id }]}
                >
                  Delete Chat
                </ActionButton>
                <ActionButton className="btn-secondary px-4 py-2 rounded" $onclick="chat-history-hide-modals">
                  Cancel
                </ActionButton>
              </div>
            )}
          >
            <p className="delete-confirmation-text mb-2">
              Are you sure you want to delete chat <span className="delete-confirmation-name font-bold">"{state.chatToDelete.name}"</span>?
            </p>
            <p className="warning delete-confirmation-warning text-system mb-4">
              ⚠️ This action cannot be undone.
            </p>
          </ModalShell>
        )}

        {/* Message Delete Confirmation Modal */}
        {state.messageToDelete && (
          <ModalShell
            title="Delete Message"
            overlayClassName="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            overlayAttrs={{ $onclick: 'hide-delete-message-confirm' }}
            contentClassName="modal-content chat-history-modal bg-white rounded-lg p-6 max-w-md"
            contentAttrs={{ onclick: (e: Event) => e.stopPropagation() }}
            closeButtonClassName="modal-close-btn absolute top-4 right-4 text-2xl"
            closeAttrs={{ $onclick: 'hide-delete-message-confirm' }}
            footer={(
              <div className="form-actions flex gap-2 justify-end">
                <ActionButton
                  className="btn-danger px-4 py-2 rounded"
                  $onclick="delete-message-confirmed"
                >
                  Delete Message
                </ActionButton>
                <ActionButton className="btn-secondary px-4 py-2 rounded" $onclick="hide-delete-message-confirm">
                  Cancel
                </ActionButton>
              </div>
            )}
          >
            <p className="delete-confirmation-text mb-2">
              Are you sure you want to delete this message?
            </p>
            <p className="warning delete-confirmation-warning text-system mb-4">
              ⚠️ This action will delete the message and all messages after it. This cannot be undone.
            </p>
          </ModalShell>
        )}

      </div>
    );
  };

  // we could select events to be global, but for simplicity we keep them local
  override is_global_event = () => true;

  override mounted = () => {
    if (typeof window === 'undefined') return;
    this.handleViewportChange();
    window.addEventListener('resize', this.handleViewportChange);
    window.addEventListener('orientationchange', this.handleViewportChange);
  };

  /**
   * Phase 2: Cleanup lifecycle - cancel RAF and timers on unmount
   */
  override unload = () => {
    if (this.state.debounceFrameId !== null) {
      cancelAnimationFrame(this.state.debounceFrameId);
    }
    if (this.state.elapsedIntervalId !== null) {
      clearInterval(this.state.elapsedIntervalId);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.handleViewportChange);
      window.removeEventListener('orientationchange', this.handleViewportChange);
    }
  };

  override update = {
    // Route handler and message handlers (merged)
    ...worldUpdateHandlers,

    ...worldRouteUiHandlers,

  };
}

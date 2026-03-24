/**
 * WorldDashboard - Fixed-state generative dashboard layout component.
 *
 * Purpose: Renders a grid of agent zones instead of a scrolling chat.
 * Each zone displays the latest message from its assigned agent, replacing
 * content on update rather than appending.
 *
 * Key features:
 * - Data-driven zone layout from world.dashboardZones config
 * - Reuses existing message rendering pipeline (including VexFlow)
 * - Includes composer input for user messages and world-scoped reasoning control
 * - Toggle to switch to full chat history view
 *
 * Notes:
 * - This is an AppRun functional component (no class, no internal state)
 * - All state comes from WorldComponentState via props
 * - Zone content is resolved from the messages array using dashboard-zones.ts
 * - Composer dropdown labels intentionally match the chat composer wording.
 */

import { app } from 'apprun';
import type { DashboardZone, DashboardZoneState, Message } from '../../../types';
import { renderMessageContent } from '../../../domain/message-content';
import { ActionButton, IconActionButton, SelectControl, TextAreaControl } from '../../../patterns';
import { getComposerActionState } from './world-chat';

export interface WorldDashboardProps {
  worldName: string;
  currentChatId?: string | null;
  messages?: Message[];
  userInput?: string;
  isSending: boolean;
  isWaiting: boolean;
  isStopping?: boolean;
  isBusy?: boolean;
  dashboardZones: DashboardZone[];
  dashboardZoneContent: Map<string, DashboardZoneState>;
  dashboardShowHistory: boolean;
  activeHitlPrompt?: any;
  submittingHitlRequestId?: string | null;
  reasoningEffort?: 'default' | 'none' | 'low' | 'medium' | 'high';
}

/**
 * Render a single dashboard zone panel.
 */
function DashboardZonePanel(props: {
  zone: DashboardZone;
  zoneState: DashboardZoneState;
}) {
  const { zone, zoneState } = props;
  const { message, isStreaming } = zoneState;

  const sizeClass = `dashboard-zone-${zone.size}`;
  const statusClass = isStreaming ? 'zone-streaming' : message ? 'zone-idle' : 'zone-empty';
  const isNotationZone = zone.id === 'notation';

  return (
    <div className={`dashboard-zone ${sizeClass} ${statusClass}`} id={`zone-${zone.id}`}>
      <div className="dashboard-zone-header">
        <span className="dashboard-zone-label">{zone.label}</span>
        <span className="dashboard-zone-status">
          {isStreaming ? (
            <span className="zone-status-indicator streaming">●</span>
          ) : message ? (
            <span className="zone-status-indicator idle">●</span>
          ) : null}
        </span>
      </div>
      <div className="dashboard-zone-content">
        {message ? (
          isStreaming
            ? (
              <div className="message-content text-gray-500">
                {isNotationZone ? 'Rendering sheet music...' : 'Generating...'}
              </div>
            )
            : renderMessageContent(message)
        ) : (
          <div className="dashboard-zone-empty">
            <span className="text-gray-400">Waiting for {zone.label}...</span>
          </div>
        )}
      </div>
      {message && (
        <div className="dashboard-zone-footer">
          <span className="dashboard-zone-timestamp">
            {new Date(message.createdAt).toLocaleTimeString()}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * WorldDashboard - main dashboard layout component.
 */
export default function WorldDashboard(props: WorldDashboardProps) {
  const {
    dashboardZones,
    dashboardZoneContent,
    dashboardShowHistory,
    currentChatId,
    userInput,
    isSending,
    isWaiting,
    isStopping,
    isBusy,
    activeHitlPrompt,
    submittingHitlRequestId = null,
    reasoningEffort = 'default',
  } = props;

  const { composerDisabled, actionButtonDisabled, actionButtonClass, actionButtonLabel, canStopCurrentSession } =
    getComposerActionState({
      currentChatId: currentChatId || '',
      isWaiting: isWaiting || false,
      isBusy: isBusy || false,
      isStopping: isStopping || false,
      isSending,
      hasActiveHitlPrompt: !!activeHitlPrompt,
      userInput: userInput || '',
    });

  const inputPlaceholder = isWaiting
    ? 'Agents are working...'
    : 'Type a message...';

  return (
    <fieldset className="world-dashboard-fieldset">
      <div className="world-dashboard-container">
        {/* Dashboard header with toggle */}
        <div className="dashboard-header">
          <ActionButton
            className="dashboard-toggle-btn"
            $onclick="toggle-dashboard-history"
            title={dashboardShowHistory ? 'Show Dashboard' : 'Show Chat History'}
          >
            {dashboardShowHistory ? '◧ Dashboard' : '☰ History'}
          </ActionButton>
        </div>

        {/* Zone grid */}
        <div className="dashboard-zone-grid">
          {dashboardZones.map(zone => {
            const zoneState = dashboardZoneContent.get(zone.id) || { message: null, isStreaming: false };
            return (
              <DashboardZonePanel
                zone={zone}
                zoneState={zoneState}
              />
            );
          })}
        </div>

        {/* User Input Area — same composer as WorldChat */}
        <div className="input-area">
          <div className="composer-shell">
            <TextAreaControl
              className="composer-textarea"
              placeholder={inputPlaceholder}
              value={userInput || ''}
              $oninput='update-input'
              $onkeydown='key-press'
              rows={1}
              aria-label="Message input"
              disabled={composerDisabled}
            />
            <div className="composer-toolbar">
              <div className="composer-toolbar-left">
                <SelectControl
                  className="composer-reasoning-effort-select"
                  $onchange='set-reasoning-effort'
                  aria-label="Reasoning effort"
                  title="Reasoning effort"
                  data-testid="composer-reasoning-effort"
                >
                  <option value="default" selected={reasoningEffort === 'default'}>Not set</option>
                  <option value="none" selected={reasoningEffort === 'none'}>None</option>
                  <option value="low" selected={reasoningEffort === 'low'}>Low</option>
                  <option value="medium" selected={reasoningEffort === 'medium'}>Medium</option>
                  <option value="high" selected={reasoningEffort === 'high'}>High</option>
                </SelectControl>
                {activeHitlPrompt ? (
                  <div className="hitl-inline-actions hitl-inline-option-actions">
                    <span className="text-xs text-gray-600 mr-2">
                      {activeHitlPrompt.title || 'Human input required'}
                    </span>
                    {(activeHitlPrompt.options || []).map((option: any) => {
                      const isSubmitting = submittingHitlRequestId === activeHitlPrompt.requestId;
                      return (
                        <ActionButton
                          key={option.id}
                          className="btn-secondary px-3 py-1 rounded shrink-0"
                          disabled={isSubmitting}
                          $onclick={['respond-hitl-option', {
                            requestId: activeHitlPrompt.requestId,
                            optionId: option.id,
                            chatId: activeHitlPrompt.chatId
                          }]}
                        >
                          {option.label}
                        </ActionButton>
                      );
                    })}
                  </div>
                ) : null}
              </div>
              <IconActionButton
                className={actionButtonClass}
                $onclick={canStopCurrentSession ? 'stop-message-processing' : 'send-message'}
                disabled={actionButtonDisabled}
                title={actionButtonLabel}
                aria-label={actionButtonLabel}
                icon={canStopCurrentSession ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="composer-submit-icon"
                    aria-hidden="true"
                  >
                    <rect x="6" y="6" width="12" height="12" rx="1.5" />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="composer-submit-icon"
                    aria-hidden="true"
                  >
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                )}
              />
            </div>
          </div>
        </div>
      </div>
    </fieldset>
  );
}

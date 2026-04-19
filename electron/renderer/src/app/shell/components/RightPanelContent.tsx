/**
 * Right Panel Content Router
 * Purpose:
 * - Route the shell right panel to dedicated shell- or feature-owned panel bodies.
 *
 * Key Features:
 * - Delegates logs to a shell-owned content module.
 * - Delegates settings, worlds, and agents to their owning feature modules.
 * - Keeps the app shell focused on framing and routing.
 *
 * Implementation Notes:
 * - Avoids reintroducing a cross-domain catch-all content owner in `app/shell`.
 *
 * Recent Changes:
 * - 2026-04-19: Replaced the transitional catch-all panel implementation with explicit shell/feature routing.
 */

import { AgentPanelContent } from '../../../features/agents';
import { SettingsPanelContent } from '../../../features/settings';
import { WorldPanelContent } from '../../../features/worlds';
import LogsPanelContent from './LogsPanelContent';

export default function RightPanelContent(props) {
  if (props.panelMode === 'logs') {
    return <LogsPanelContent panelLogs={props.panelLogs} onClearPanelLogs={props.onClearPanelLogs} />;
  }

  if (props.panelMode === 'settings') {
    return <SettingsPanelContent {...props} />;
  }

  if (props.panelMode === 'create-agent' || props.panelMode === 'edit-agent') {
    return <AgentPanelContent {...props} />;
  }

  return <WorldPanelContent {...props} />;
}

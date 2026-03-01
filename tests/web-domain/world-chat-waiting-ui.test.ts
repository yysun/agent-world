/**
 * World Chat Waiting UI Tests
 *
 * Purpose:
 * - Verify waiting/streaming placeholder UI config for the web chat transcript.
 *
 * Coverage:
 * - Waiting message row hides avatar container.
 * - Waiting message row reserves avatar-column spacing for left alignment.
 * - Streaming placeholder rows (`...`) are hidden before real stream content arrives.
 * - Streaming placeholder hides inline `responding ...` indicator.
 * - Message timestamp placement uses top metadata row.
 * - Timestamp formatter falls back to `Now` for missing values.
 *
 * Notes:
 * - Tests config-level behavior exposed by world-chat domain component helpers.
 *
 * Recent Changes:
 * - 2026-03-01: Added top timestamp placement and timestamp formatting assertions.
 * - 2026-03-01: Initial test file created for waiting-message UI cleanup.
 */

import { describe, expect, it } from 'vitest';
import {
  formatMessageTimestamp,
  getMessageMetaUiConfig,
  getWaitingMessageUiConfig,
  isStreamingPlaceholderMessage,
} from '../../web/src/components/world-chat';

describe('web/world-chat waiting UI config', () => {
  it('hides avatar in waiting message box', () => {
    const config = getWaitingMessageUiConfig();
    expect(config.showWaitingAvatar).toBe(false);
  });

  it('reserves avatar column spacing so waiting status aligns with message boxes', () => {
    const config = getWaitingMessageUiConfig();
    expect(config.reserveWaitingAvatarSpace).toBe(true);
  });

  it('hides transcript placeholder message rows until stream content arrives', () => {
    const config = getWaitingMessageUiConfig();
    expect(config.hideStreamingPlaceholderMessage).toBe(true);
    expect(isStreamingPlaceholderMessage({ isStreaming: true, text: '...' } as any)).toBe(true);
    expect(isStreamingPlaceholderMessage({ isStreaming: true, text: 'First streamed chunk' } as any)).toBe(false);
  });

  it('hides inline responding indicator for streaming placeholders', () => {
    const config = getWaitingMessageUiConfig();
    expect(config.showStreamingRespondingIndicator).toBe(false);
  });

  it('renders message timestamps in the top metadata row', () => {
    const config = getMessageMetaUiConfig();
    expect(config.timestampPlacement).toBe('top');
  });

  it('formats missing timestamps as Now', () => {
    expect(formatMessageTimestamp(undefined)).toBe('Now');
  });
});

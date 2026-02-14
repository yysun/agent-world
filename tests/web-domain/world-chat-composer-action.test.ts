/**
 * World Chat Composer Action Tests
 *
 * Purpose:
 * - Verify send/stop button toggle logic used by web chat composer.
 *
 * Coverage:
 * - Stop mode activates only for active current-chat processing.
 * - Stop mode disabled state while stop request is in flight.
 * - Send mode labels/disable rules for idle and sending states.
 */

import { describe, expect, it } from 'vitest';
import { getComposerActionState } from '../../web/src/components/world-chat';

describe('web/world-chat composer action', () => {
  it('shows stop mode when current chat is processing', () => {
    const state = getComposerActionState({
      currentChatId: 'chat-1',
      isWaiting: true,
      isBusy: false,
      isStopping: false,
      isSending: false,
      userInput: 'hello',
    });

    expect(state.canStopCurrentSession).toBe(true);
    expect(state.actionButtonClass).toBe('send-button stop-button');
    expect(state.actionButtonText).toBe('Stop');
    expect(state.actionButtonDisabled).toBe(false);
  });

  it('disables stop mode while stop request is in flight', () => {
    const state = getComposerActionState({
      currentChatId: 'chat-1',
      isWaiting: true,
      isBusy: true,
      isStopping: true,
      isSending: false,
      userInput: 'hello',
    });

    expect(state.canStopCurrentSession).toBe(true);
    expect(state.actionButtonText).toBe('Stopping...');
    expect(state.actionButtonDisabled).toBe(true);
  });

  it('uses send mode and disables empty input when not processing', () => {
    const state = getComposerActionState({
      currentChatId: 'chat-1',
      isWaiting: false,
      isBusy: false,
      isStopping: false,
      isSending: false,
      userInput: '   ',
    });

    expect(state.canStopCurrentSession).toBe(false);
    expect(state.actionButtonClass).toBe('send-button');
    expect(state.actionButtonText).toBe('Send');
    expect(state.actionButtonDisabled).toBe(true);
  });

  it('shows sending label when actively sending and not in stop mode', () => {
    const state = getComposerActionState({
      currentChatId: null,
      isWaiting: false,
      isBusy: false,
      isStopping: false,
      isSending: true,
      userInput: 'hello',
    });

    expect(state.canStopCurrentSession).toBe(false);
    expect(state.actionButtonText).toBe('Sending...');
    expect(state.actionButtonDisabled).toBe(true);
  });
});

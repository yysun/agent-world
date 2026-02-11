/**
 * Activity Indicators - Visual feedback components for streaming and activity state
 * 
 * Components:
 * - ThinkingIndicator: Animated dots during waiting
 * - ActivityPulse: Pulsing dot showing busy/idle state
 * - ElapsedTimeCounter: Timer showing elapsed activity time
 * 
 * Phase 3: Basic Indicators - Activity Feedback
 * Created: 2026-02-11
 */

import { app } from 'apprun';

// ========================================
// THINKING INDICATOR (3-dot animation)
// ========================================

export interface ThinkingIndicatorProps {
  visible?: boolean;
}

export function ThinkingIndicator(props: ThinkingIndicatorProps) {
  const { visible = true } = props;

  if (!visible) {
    return null;
  }

  return (
    <div className="thinking-indicator" role="status" aria-live="polite">
      <div className="thinking-dots">
        <span className="dot">.</span>
        <span className="dot">.</span>
        <span className="dot">.</span>
      </div>
      <span className="thinking-text">Thinking...</span>
    </div>
  );
}

// ========================================
// ACTIVITY PULSE (busy/idle indicator)
// ========================================

export interface ActivityPulseProps {
  isBusy: boolean;
  label?: string;
}

export function ActivityPulse(props: ActivityPulseProps) {
  const { isBusy, label } = props;

  const pulseClass = isBusy ? 'activity-pulse active' : 'activity-pulse idle';

  return (
    <div className="activity-pulse-container">
      <div className={pulseClass} role="status" aria-label={isBusy ? 'Busy' : 'Idle'}></div>
      {label && <span className="activity-label">{label}</span>}
    </div>
  );
}

// ========================================
// ELAPSED TIME COUNTER
// ========================================

export interface ElapsedTimeCounterProps {
  elapsedMs: number;
  showIcon?: boolean;
}

/**
 * Format milliseconds as mm:ss or hh:mm:ss
 */
function formatElapsedTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  // Manual padding helper
  const pad = (num: number) => (num < 10 ? '0' + num : String(num));

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }

  return `${minutes}:${pad(seconds)}`;
}

export function ElapsedTimeCounter(props: ElapsedTimeCounterProps) {
  const { elapsedMs, showIcon = true } = props;

  if (elapsedMs === 0) {
    return null;
  }

  return (
    <div className="elapsed-counter" role="timer">
      {showIcon && <span className="clock-icon">⏱️</span>}
      <span className="elapsed-time">{formatElapsedTime(elapsedMs)}</span>
    </div>
  );
}

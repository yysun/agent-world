/**
 * Purpose:
 * - Provide a reusable centered state layout for loading, error, and empty page states.
 *
 * Key Features:
 * - Renders a centered title/body/actions stack with shared spacing.
 * - Composes generic primitives instead of embedding feature-specific behavior.
 *
 * Notes on Implementation:
 * - Callers own button actions and copy; this pattern only owns layout.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Added the centered state pattern for Home and Settings feature views.
 */

import { PrimitiveButton } from '../primitives';

type CenteredStateAction = {
  label: string;
  className?: string;
} & Record<string, unknown>;

type CenteredStatePanelProps = {
  title: string;
  body?: string | null;
  actions?: CenteredStateAction[];
  testId?: string;
};

export function CenteredStatePanel({
  title,
  body,
  actions = [],
  testId,
}: CenteredStatePanelProps) {
  return <div className="flex flex-col items-center justify-center min-h-screen gap-4" data-testid={testId}>
    <div className="text-center">
      <h3 className="text-2xl font-bold text-text-primary mb-2">{title}</h3>
      {body ? <p className="text-lg text-text-secondary mb-4">{body}</p> : null}
      {actions.map((action, index) => {
        const { label, className = 'btn btn-primary px-6 py-3', ...attrs } = action;
        return <PrimitiveButton key={`${label}-${index}`} className={className} {...attrs}>{label}</PrimitiveButton>;
      })}
    </div>
  </div>;
}

export default CenteredStatePanel;
/**
 * HITL Prompt Modal Component
 * Purpose:
 * - Render the approval-required overlay for human-in-the-loop option prompts.
 *
 * Key Features:
 * - Displays title/message content for active HITL requests.
 * - Renders selectable option buttons with optional descriptions.
 * - Disables actions while a response for the active request is submitting.
 *
 * Implementation Notes:
 * - Receives prompt state and responder callback from `App.jsx` orchestration.
 * - Preserves existing modal styling and behavior from the inline renderer block.
 *
 * Recent Changes:
 * - 2026-02-17: Extracted from `App.jsx` as part of Phase 4 component decomposition.
 */

export default function HitlPromptModal({
  activeHitlPrompt,
  submittingHitlRequestId,
  onRespond,
}) {
  if (!activeHitlPrompt) return null;

  const isSubmitting = submittingHitlRequestId === activeHitlPrompt.requestId;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-4 shadow-2xl">
        <h3 className="text-sm font-semibold text-foreground">
          {activeHitlPrompt.title || 'Approval required'}
        </h3>
        <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
          {(activeHitlPrompt.message || 'Please choose an option to continue.').replace(/\n\s*\n+/g, '\n')}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {activeHitlPrompt.options.map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={isSubmitting}
              onClick={() => onRespond(activeHitlPrompt, option.id)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-left text-xs hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="font-medium text-foreground">{option.label}</div>
              {option.description ? (
                <div className="mt-0.5 text-[11px] text-muted-foreground">{option.description}</div>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
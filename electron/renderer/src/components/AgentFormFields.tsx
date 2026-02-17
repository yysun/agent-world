/**
 * Agent Form Fields Component
 *
 * Features:
 * - Shared field layout for create/edit agent forms
 * - Includes compact Auto Reply switch and two-column LLM provider/model row
 * - Expanding System Prompt section that fills available panel height
 *
 * Implementation Notes:
 * - Uses functional state updaters passed from parent (`setAgent`) for each field
 * - Parent controls submit/delete/cancel actions and modal routing
 *
 * Recent Changes:
 * - 2026-02-14: Added explicit `aria-labelledby` wiring for the Auto Reply switch to keep it screen-reader labeled after refactor.
 * - 2026-02-14: Extracted from App.jsx to remove duplicated agent create/edit form markup.
 */

import React, { useId } from 'react';

export default function AgentFormFields({
  agent,
  setAgent,
  disabled,
  providerOptions,
  onExpandPrompt
}) {
  const autoReplyLabelId = useId();

  return (
    <>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-bold text-sidebar-foreground/90">Agent Name</label>
        <input
          value={agent.name}
          onChange={(event) => setAgent((value) => ({ ...value, name: event.target.value }))}
          placeholder="Agent name"
          className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
          disabled={disabled}
        />
      </div>

      <div className="flex items-center justify-between rounded-md pr-1 py-1">
        <label id={autoReplyLabelId} className="text-xs font-bold text-sidebar-foreground/90">Auto Reply</label>
        <button
          type="button"
          role="switch"
          aria-labelledby={autoReplyLabelId}
          aria-checked={agent.autoReply !== false}
          onClick={() => setAgent((value) => ({ ...value, autoReply: value.autoReply === false }))}
          disabled={disabled}
          className="rounded-full disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${agent.autoReply !== false ? 'bg-sidebar-primary/62' : 'bg-sidebar-foreground/24'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${agent.autoReply !== false ? 'translate-x-4' : 'translate-x-1'}`} />
          </span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-bold text-sidebar-foreground/90">LLM Provider</label>
          <select
            value={agent.provider}
            onChange={(event) => setAgent((value) => ({ ...value, provider: event.target.value }))}
            className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none focus:border-sidebar-ring"
            disabled={disabled}
          >
            {providerOptions.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-bold text-sidebar-foreground/90">LLM model</label>
          <input
            value={agent.model}
            onChange={(event) => setAgent((value) => ({ ...value, model: event.target.value }))}
            placeholder="Model (for example: gpt-4o-mini)"
            className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
            disabled={disabled}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-bold text-sidebar-foreground/90">Temperature</label>
          <input
            type="number"
            step="0.1"
            value={agent.temperature}
            onChange={(event) => setAgent((value) => ({ ...value, temperature: event.target.value }))}
            placeholder="Temperature"
            className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
            disabled={disabled}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-bold text-sidebar-foreground/90">Max Tokens</label>
          <input
            type="number"
            min="1"
            value={agent.maxTokens}
            onChange={(event) => setAgent((value) => ({ ...value, maxTokens: event.target.value }))}
            placeholder="Max tokens"
            className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
            disabled={disabled}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1">
        <label className="text-xs font-bold text-sidebar-foreground/90">System Prompt</label>
        <div className="relative min-h-0 flex-1">
          <textarea
            value={agent.systemPrompt}
            onChange={(event) => setAgent((value) => ({ ...value, systemPrompt: event.target.value }))}
            placeholder="System prompt (optional)"
            className="h-full min-h-24 w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
            disabled={disabled}
          />
          <button
            type="button"
            onClick={onExpandPrompt}
            className="absolute right-2 top-2 rounded p-1 text-sidebar-foreground/50 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
            title="Expand editor"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}

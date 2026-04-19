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
 * - 2026-04-19: Moved into the agents feature so panel ownership no longer relies on the transitional components layer.
 * - 2026-02-14: Added explicit `aria-labelledby` wiring for the Auto Reply switch to keep it screen-reader labeled after refactor.
 * - 2026-02-14: Extracted from App.jsx to remove duplicated agent create/edit form markup.
 */

import React, { useId } from 'react';
import { LabeledField } from '../../../design-system/patterns';
import { Input, Select, Switch, Textarea } from '../../../design-system/primitives';

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
      <LabeledField label="Agent Name">
        <Input
          value={agent.name}
          onChange={(event) => setAgent((value) => ({ ...value, name: event.target.value }))}
          placeholder="Agent name"
          tone="sidebar"
          disabled={disabled}
        />
      </LabeledField>

      <div className="flex items-center justify-between rounded-md pr-1 py-1">
        <label id={autoReplyLabelId} className="text-xs font-bold text-sidebar-foreground/90">Auto Reply</label>
        <Switch
          aria-labelledby={autoReplyLabelId}
          onClick={() => setAgent((value) => ({ ...value, autoReply: value.autoReply === false }))}
          checked={agent.autoReply !== false}
          disabled={disabled}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <LabeledField label="LLM Provider">
          <Select
            value={agent.provider}
            onChange={(event) => setAgent((value) => ({ ...value, provider: event.target.value }))}
            tone="sidebar"
            disabled={disabled}
          >
            {providerOptions.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </Select>
        </LabeledField>
        <LabeledField label="LLM model">
          <Input
            value={agent.model}
            onChange={(event) => setAgent((value) => ({ ...value, model: event.target.value }))}
            placeholder="Model (for example: gpt-4o-mini)"
            tone="sidebar"
            disabled={disabled}
          />
        </LabeledField>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <LabeledField label="Temperature">
          <Input
            type="number"
            step="0.1"
            value={agent.temperature}
            onChange={(event) => setAgent((value) => ({ ...value, temperature: event.target.value }))}
            placeholder="Temperature"
            tone="sidebar"
            disabled={disabled}
          />
        </LabeledField>
        <LabeledField label="Max Tokens">
          <Input
            type="number"
            min="1"
            value={agent.maxTokens}
            onChange={(event) => setAgent((value) => ({ ...value, maxTokens: event.target.value }))}
            placeholder="Max tokens"
            tone="sidebar"
            disabled={disabled}
          />
        </LabeledField>
      </div>

      <LabeledField label="System Prompt" className="flex min-h-0 flex-1 flex-col gap-1">
        <div className="relative min-h-0 flex-1">
          <Textarea
            value={agent.systemPrompt}
            onChange={(event) => setAgent((value) => ({ ...value, systemPrompt: event.target.value }))}
            placeholder="System prompt (optional)"
            tone="sidebar"
            className="h-full min-h-24"
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
      </LabeledField>
    </>
  );
}

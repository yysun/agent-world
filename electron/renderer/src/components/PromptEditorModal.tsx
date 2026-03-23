/**
 * Prompt Editor Modal Component
 *
 * Features:
 * - Full-screen overlay modal for editing long prompt text
 * - Controlled textarea value with apply/cancel actions
 * - Reusable for create/edit agent prompt targets
 *
 * Implementation Notes:
 * - Modal visibility is controlled by the parent via `open`
 * - Parent owns prompt value and apply behavior
 *
 * Recent Changes:
 * - 2026-02-14: Extracted from App.jsx during renderer component decomposition.
 */

import React from 'react';
import { TextEditorDialog } from '../design-system/patterns';

export default function PromptEditorModal({
  open,
  value,
  onChange,
  onClose,
  onApply
}) {
  if (!open) return null;

  return (
    <TextEditorDialog
      title="Edit System Prompt"
      value={value}
      onChange={onChange}
      onClose={onClose}
      onApply={onApply}
      placeholder="Enter system prompt..."
    />
  );
}

/**
 * World Config Editor Modal Component
 *
 * Features:
 * - Shared modal editor for world variables and MCP configuration text
 * - Dynamic title and placeholder by selected config field
 * - Controlled textarea with apply/cancel actions
 *
 * Implementation Notes:
 * - Parent controls open state, active field, and apply behavior
 * - Supports `variables` and `mcpConfig` field modes
 *
 * Recent Changes:
 * - 2026-02-14: Extracted from App.jsx during renderer component decomposition.
 */

import React from 'react';
import { TextEditorDialog } from '../design-system/patterns';

export default function WorldConfigEditorModal({
  open,
  field,
  value,
  onChange,
  onClose,
  onApply
}) {
  if (!open) return null;

  const isVariablesField = field === 'variables';

  return (
    <TextEditorDialog
      title={isVariablesField ? 'Edit Variables (.env)' : 'Edit MCP Configuration'}
      value={value}
      onChange={onChange}
      onClose={onClose}
      onApply={onApply}
      placeholder={isVariablesField
        ? 'Variables (.env), e.g. working_directory=/path/to/project'
        : 'Enter MCP servers configuration as JSON...'}
      monospace={!isVariablesField}
    />
  );
}

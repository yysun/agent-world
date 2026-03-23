/**
 * TextEditorDialog Pattern
 *
 * Purpose:
 * - Provide a reusable modal text-editing interaction shell.
 *
 * Key Features:
 * - Shared overlay, header, textarea body, and footer action structure.
 * - Supports customizable labels, placeholder text, and monospace mode.
 * - Keeps workflow meaning outside the pattern through caller-provided title and handlers.
 *
 * Implementation Notes:
 * - Composed from design-system primitives only.
 *
 * Recent Changes:
 * - 2026-03-23: Added to replace duplicated prompt/config editor modal structure.
 */

import { Button, Card, IconButton, Textarea } from '../primitives';

export interface TextEditorDialogProps {
  title: string;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onApply: () => void;
  placeholder?: string;
  cancelLabel?: string;
  applyLabel?: string;
  monospace?: boolean;
}

export default function TextEditorDialog({
  title,
  value,
  onChange,
  onClose,
  onApply,
  placeholder,
  cancelLabel = 'Cancel',
  applyLabel = 'Apply',
  monospace = false,
}: TextEditorDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="flex h-[80vh] w-[80vw] max-w-4xl flex-col" padding="none" tone="elevated">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          <IconButton
            onClick={onClose}
            label={`Close ${title}`}
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </IconButton>
        </div>
        <div className="flex-1 p-4">
          <Textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            size="md"
            monospace={monospace}
            className="h-full resize-none"
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button onClick={onClose} variant="outline">
            {cancelLabel}
          </Button>
          <Button onClick={onApply}>
            {applyLabel}
          </Button>
        </div>
      </Card>
    </div>
  );
}
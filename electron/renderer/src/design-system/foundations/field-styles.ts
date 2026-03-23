/**
 * Design-System Field Style Aliases
 *
 * Purpose:
 * - Define semantic visual aliases for shared form-control tones.
 *
 * Key Features:
 * - Centralizes default and sidebar-oriented field theming.
 * - Keeps primitive controls aligned with theme-level border/background/text rules.
 *
 * Implementation Notes:
 * - This is a private foundations helper and is not re-exported from the public design-system root.
 *
 * Recent Changes:
 * - 2026-03-23: Added to support generic Input, Select, and Textarea primitives.
 */

export type FieldTone = 'default' | 'sidebar';

export const FIELD_TONE_CLASS_NAMES: Record<FieldTone, string> = {
  default: 'border-input bg-card text-foreground placeholder:text-muted-foreground focus:border-ring',
  sidebar: 'border-sidebar-border bg-sidebar-accent text-sidebar-foreground placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring',
};
/**
 * Purpose:
 * - Provide a generic text-like input primitive for AppRun view composition.
 *
 * Key Features:
 * - Forwards arbitrary AppRun and DOM attributes to the native input element.
 * - Keeps the primitive free of business-specific layout and behavior.
 *
 * Notes on Implementation:
 * - Used by pattern-level form controls so feature code does not own raw input markup.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Added the shared input primitive for layered web control extraction.
 */

type PrimitiveInputProps = {
  className?: string;
} & Record<string, unknown>;

export function PrimitiveInput({
  className = '',
  ...attrs
}: PrimitiveInputProps) {
  return <input className={className} {...attrs} />;
}

export default PrimitiveInput;
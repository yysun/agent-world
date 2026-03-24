/**
 * Purpose:
 * - Provide pattern-level form controls backed by shared input primitives.
 *
 * Key Features:
 * - Exposes generic input, textarea, and select controls for feature and page code.
 * - Keeps raw form-control markup inside the design-system layers.
 *
 * Notes on Implementation:
 * - Option markup stays with callers so domain-specific choices remain explicit.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Normalized AppRun child forwarding so select option labels render through pattern wrappers.
 * - 2026-03-24: Added shared control patterns for the layered web UI contract.
 */

import { PrimitiveInput, PrimitiveSelect, PrimitiveTextarea } from '../primitives';
import { resolveAppRunChildren } from '../utils/apprun-children';

type TextInputControlProps = {
  className?: string;
} & Record<string, unknown>;

type TextAreaControlProps = {
  className?: string;
} & Record<string, unknown>;

type SelectControlProps = {
  children?: any;
  className?: string;
} & Record<string, unknown>;

export function TextInputControl({
  className = '',
  ...attrs
}: TextInputControlProps) {
  return <PrimitiveInput className={className} {...attrs} />;
}

export function TextAreaControl({
  className = '',
  ...attrs
}: TextAreaControlProps) {
  return <PrimitiveTextarea className={className} {...attrs} />;
}

export function SelectControl({
  children,
  className = '',
  ...attrs
}: SelectControlProps, runtimeChildren?: any) {
  return <PrimitiveSelect className={className} {...attrs}>{resolveAppRunChildren(children, runtimeChildren)}</PrimitiveSelect>;
}

export default TextInputControl;

/**
 * Purpose:
 * - Provide a generic select primitive for AppRun view composition.
 *
 * Key Features:
 * - Forwards AppRun event bindings and DOM attributes to the native select element.
 * - Keeps option rendering owned by callers while standardizing the base control surface.
 *
 * Notes on Implementation:
 * - Children are passed through unchanged so feature-level option sets remain declarative.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Normalized AppRun child forwarding so JSX option trees render correctly.
 * - 2026-03-24: Added the shared select primitive for layered web control extraction.
 */

import { resolveAppRunChildren } from '../utils/apprun-children';

type PrimitiveSelectProps = {
  children?: any;
  className?: string;
} & Record<string, unknown>;

export function PrimitiveSelect({
  children,
  className = '',
  ...attrs
}: PrimitiveSelectProps, runtimeChildren?: any) {
  return <select className={className} {...attrs}>{resolveAppRunChildren(children, runtimeChildren)}</select>;
}

export default PrimitiveSelect;

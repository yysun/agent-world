/**
 * Purpose:
 * - Provide a generic textarea primitive for AppRun view composition.
 *
 * Key Features:
 * - Forwards arbitrary AppRun and DOM attributes to the native textarea element.
 * - Keeps textarea markup out of feature-owned view modules.
 *
 * Notes on Implementation:
 * - Used by pattern controls and field wrappers rather than directly by feature code.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Normalized AppRun child forwarding so nested textarea content remains available.
 * - 2026-03-24: Added the shared textarea primitive for layered web control extraction.
 */

import { resolveAppRunChildren } from '../utils/apprun-children';

type PrimitiveTextareaProps = {
  children?: any;
  className?: string;
} & Record<string, unknown>;

export function PrimitiveTextarea({
  children,
  className = '',
  ...attrs
}: PrimitiveTextareaProps, runtimeChildren?: any) {
  return <textarea className={className} {...attrs}>{resolveAppRunChildren(children, runtimeChildren)}</textarea>;
}

export default PrimitiveTextarea;

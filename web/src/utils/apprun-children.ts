/**
 * Purpose:
 * - Normalize JSX children across AppRun function components.
 *
 * Key Features:
 * - Prefers the second positional children argument AppRun passes to function components.
 * - Falls back to `props.children` for direct function invocation in tests and helper code.
 *
 * Notes on Implementation:
 * - AppRun does not inject JSX children into the props object for function components.
 * - An empty positional children array should not overwrite an explicitly provided prop child tree.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Added shared child resolution so pattern/primitives render modal body copy and action labels.
 */

export function resolveAppRunChildren(
  propsChildren: any,
  runtimeChildren?: any,
): any {
  if (Array.isArray(runtimeChildren)) {
    return runtimeChildren.length > 0 ? runtimeChildren : propsChildren;
  }

  return runtimeChildren ?? propsChildren;
}

export default resolveAppRunChildren;

/**
 * Purpose:
 * - Provide a small reusable button primitive for AppRun view composition.
 *
 * Key Features:
 * - Supports shared className composition and forwards AppRun event attributes.
 * - Keeps primitive markup generic and free of feature-specific behavior.
 *
 * Notes on Implementation:
 * - Accepts an open-ended attribute bag so AppRun `$onclick` and test selectors can pass through.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Added the shared button primitive for the layered web view architecture.
 */

type PrimitiveButtonProps = {
  children: any;
  className?: string;
  title?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
} & Record<string, unknown>;

export function PrimitiveButton({
  children,
  className = '',
  title,
  disabled,
  type = 'button',
  ...attrs
}: PrimitiveButtonProps) {
  return <button
    type={type}
    className={className}
    title={title}
    disabled={disabled}
    {...attrs}
  >
    {children}
  </button>;
}

export default PrimitiveButton;
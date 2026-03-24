/**
 * Purpose:
 * - Provide pattern-level action controls backed by the shared button primitive.
 *
 * Key Features:
 * - Standardizes action button usage for feature and page code without exposing primitives directly.
 * - Supports icon-only and icon-plus-label actions with pass-through AppRun attributes.
 *
 * Notes on Implementation:
 * - Patterns import primitives directly to preserve the no-lateral-import rule within the pattern layer.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Added shared action button patterns for the layered web UI contract.
 */

import { PrimitiveButton } from '../primitives';

type ActionButtonProps = {
  children?: any;
  className?: string;
} & Record<string, unknown>;

type IconActionButtonProps = {
  icon?: any;
  label?: any;
  children?: any;
  className?: string;
  iconClassName?: string;
  labelClassName?: string;
} & Record<string, unknown>;

export function ActionButton({
  children,
  className = '',
  ...attrs
}: ActionButtonProps) {
  return <PrimitiveButton className={className} {...attrs}>{children}</PrimitiveButton>;
}

export function IconActionButton({
  icon,
  label,
  children,
  className = '',
  iconClassName = '',
  labelClassName = '',
  ...attrs
}: IconActionButtonProps) {
  return (
    <PrimitiveButton className={className} {...attrs}>
      {icon ? <span className={iconClassName}>{icon}</span> : null}
      {label !== undefined && label !== null ? <span className={labelClassName}>{label}</span> : children}
    </PrimitiveButton>
  );
}

export default ActionButton;
/**
 * Purpose:
 * - Provide a reusable modal shell pattern for AppRun dialogs and confirmations.
 *
 * Key Features:
 * - Standardizes overlay, header, close button, body, and footer composition.
 * - Accepts pass-through overlay/content/close attributes for AppRun event wiring.
 *
 * Notes on Implementation:
 * - The shell owns only layout; feature code still supplies dialog copy and actions.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Normalized AppRun child forwarding so modal body content renders inside shared dialogs.
 * - 2026-03-24: Added the shared modal shell pattern for layered web dialogs.
 */

import { PrimitiveButton } from '../primitives';
import { resolveAppRunChildren } from '../utils/apprun-children';

type ModalShellProps = {
  children: any;
  className?: string;
  closeAttrs?: Record<string, unknown>;
  closeButtonClassName?: string;
  closeLabel?: any;
  closeTitle?: string;
  contentAttrs?: Record<string, unknown>;
  contentClassName?: string;
  footer?: any;
  footerClassName?: string;
  headerActions?: any;
  overlayAttrs?: Record<string, unknown>;
  overlayClassName?: string;
  title: any;
  titleClassName?: string;
};

export function ModalShell({
  children,
  className = '',
  closeAttrs,
  closeButtonClassName = 'modal-close-btn',
  closeLabel = 'x',
  closeTitle = 'Close',
  contentAttrs,
  contentClassName = 'modal-content',
  footer,
  footerClassName = 'modal-footer',
  headerActions,
  overlayAttrs,
  overlayClassName = 'modal-backdrop',
  title,
  titleClassName = 'modal-title',
}: ModalShellProps, runtimeChildren?: any) {
  const resolvedChildren = resolveAppRunChildren(children, runtimeChildren);

  return <div className={`${overlayClassName} ${className}`.trim()} {...overlayAttrs}>
    <div className={contentClassName} {...contentAttrs}>
      <div className="modal-header">
        <h2 className={titleClassName}>{title}</h2>
        <div className="modal-header-actions">
          {headerActions}
          <PrimitiveButton
            className={closeButtonClassName}
            title={closeTitle}
            {...(closeAttrs || {})}
          >
            {closeLabel}
          </PrimitiveButton>
        </div>
      </div>
      <div className="modal-body">{resolvedChildren}</div>
      {footer ? <div className={footerClassName}>{footer}</div> : null}
    </div>
  </div>;
}

export default ModalShell;

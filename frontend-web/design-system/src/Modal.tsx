import type { ReactNode } from 'react';

export interface ModalProps {
  /** Heading shown in the modal header. */
  title: string;
  /** Use the compact 420px width instead of the default 560px. */
  small?: boolean;
  /** Optional footer content (e.g. a primary action), rendered in the bordered footer. */
  footer?: ReactNode;
  children: ReactNode;
  onClose?: () => void;
}

/**
 * A centered modal dialog over a dimmed overlay: header with title + close
 * button, a body, and an optional bordered footer. The overlay covers the
 * viewport; render it at the app root.
 * @category Navigation
 */
export function Modal({ title, small, footer, children, onClose }: ModalProps) {
  return (
    <div className="modal-overlay">
      <div className={`modal${small ? ' small' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="icon-btn" title="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Download, Trash2 } from 'lucide-react';
import { useModalBehavior } from '../../hooks/useModalBehavior';
import type { ConfirmDetail } from '../../types/models';
import './ConfirmModal.css';

interface ConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message?: string;
  details?: ConfirmDetail[];
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'warning' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  details = [],
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel
}: ConfirmModalProps) {
  const dialogRef = useRef(null);
  const titleId = useId();
  useModalBehavior(isOpen, onCancel, dialogRef);

  // Enter confirms, except for destructive dialogs and when a button has focus:
  // pressing Enter on "Cancel" must never confirm.
  useEffect(() => {
    if (!isOpen || variant === 'danger') return undefined;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) onConfirm();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, variant, onConfirm]);

  if (!isOpen) return null;

  const IconComponent = variant === 'danger' ? Trash2 : variant === 'warning' ? AlertTriangle : Download;

  return createPortal(
    <div className="confirm-overlay" onClick={onCancel}>
      <div
        className={`confirm-dialog confirm-${variant}`}
        role={variant === 'danger' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={dialogRef}
        onClick={e => e.stopPropagation()}
      >
        <div className="confirm-header">
          <div className={`confirm-icon-wrap confirm-icon-${variant}`}>
            <IconComponent size={20} />
          </div>
          <h3 className="confirm-title" id={titleId}>{title}</h3>
        </div>

        {details.length > 0 && (
          <ul className="confirm-details">
            {details.map((d, i) => (
              <li key={i}>
                {d.icon && <span className="confirm-detail-icon">{d.icon}</span>}
                <span>{d.text}</span>
              </li>
            ))}
          </ul>
        )}

        {message && <p className="confirm-message">{message}</p>}

        <div className="confirm-actions">
          <button type="button" className="confirm-cancel-btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className={`confirm-ok-btn confirm-ok-${variant}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

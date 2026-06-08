import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Download, Trash2, HelpCircle } from 'lucide-react';
import './ConfirmModal.css';

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
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onConfirm, onCancel]);

  if (!isOpen) return null;

  const IconComponent = variant === 'danger' ? Trash2 : variant === 'warning' ? AlertTriangle : Download;

  return createPortal(
    <div className="confirm-overlay" onClick={onCancel}>
      <div className={`confirm-dialog confirm-${variant}`} onClick={e => e.stopPropagation()}>
        <div className="confirm-header">
          <div className={`confirm-icon-wrap confirm-icon-${variant}`}>
            <IconComponent size={20} />
          </div>
          <h3 className="confirm-title">{title}</h3>
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
          <button className="confirm-cancel-btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className={`confirm-ok-btn confirm-ok-${variant}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

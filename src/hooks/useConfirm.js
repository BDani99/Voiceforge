import { useState, useCallback, useRef } from 'react';

const CLOSED = {
  isOpen: false,
  title: '',
  message: '',
  details: [],
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  variant: 'default',
};

/** Promise based confirmation dialog: `if (await confirm({...})) { ... }`. */
export const useConfirm = () => {
  const [state, setState] = useState(CLOSED);
  const resolveRef = useRef(null);

  const settle = useCallback((result) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const confirm = useCallback((options) => new Promise((resolve) => {
    // A dialog that is still open is cancelled by the new one.
    resolveRef.current?.(false);
    resolveRef.current = resolve;
    setState({
      isOpen: true,
      title: options.title || 'Confirm',
      message: options.message || '',
      details: options.details || [],
      confirmLabel: options.confirmLabel || 'Confirm',
      cancelLabel: options.cancelLabel || 'Cancel',
      variant: options.variant || 'default',
    });
  }), []);

  const handleConfirm = useCallback(() => settle(true), [settle]);
  const handleCancel = useCallback(() => settle(false), [settle]);

  return { confirm, confirmState: state, handleConfirm, handleCancel };
};

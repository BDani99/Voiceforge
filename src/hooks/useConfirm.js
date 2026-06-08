import { useState, useCallback } from 'react';

export const useConfirm = () => {
  const [state, setState] = useState({
    isOpen: false,
    title: '',
    message: '',
    details: [],
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    variant: 'default',
    resolve: null
  });

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      setState({
        isOpen: true,
        title: options.title || 'Confirm',
        message: options.message || '',
        details: options.details || [],
        confirmLabel: options.confirmLabel || 'Confirm',
        cancelLabel: options.cancelLabel || 'Cancel',
        variant: options.variant || 'default',
        resolve
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setState(prev => {
      prev.resolve?.(true);
      return { ...prev, isOpen: false };
    });
  }, []);

  const handleCancel = useCallback(() => {
    setState(prev => {
      prev.resolve?.(false);
      return { ...prev, isOpen: false };
    });
  }, []);

  return { confirm, confirmState: state, handleConfirm, handleCancel };
};

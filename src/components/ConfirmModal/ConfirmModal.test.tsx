import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmModal from './ConfirmModal';

const setup = (props: Partial<React.ComponentProps<typeof ConfirmModal>> = {}) => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(<ConfirmModal isOpen title="Delete project" onConfirm={onConfirm} onCancel={onCancel} {...props} />);
  return { onConfirm, onCancel, user: userEvent.setup() };
};

describe('ConfirmModal', () => {
  it('shows title, message and details', () => {
    setup({ message: 'Are you sure?', details: [{ icon: '📝', text: '120 characters' }] });
    expect(screen.getByRole('dialog', { name: 'Delete project' })).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
    expect(screen.getByText('120 characters')).toBeInTheDocument();
  });

  it('confirms and cancels through the buttons', async () => {
    const { user, onConfirm, onCancel } = setup({ confirmLabel: 'Delete', cancelLabel: 'Keep' });
    await user.click(screen.getByRole('button', { name: 'Keep' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancels with Escape', async () => {
    const { user, onCancel } = setup();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalled();
  });

  it('confirms with Enter when nothing is focused on a button', async () => {
    const { user, onConfirm } = setup({ variant: 'warning' });
    (document.activeElement as HTMLElement).blur();
    await user.keyboard('{Enter}');
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('never confirms on Enter while the Cancel button has focus', async () => {
    const { user, onConfirm, onCancel } = setup({ variant: 'warning' });
    screen.getByRole('button', { name: 'Cancel' }).focus();
    await user.keyboard('{Enter}');
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not confirm destructive dialogs with Enter at all and uses an alertdialog', async () => {
    const { user, onConfirm } = setup({ variant: 'danger' });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    (document.activeElement as HTMLElement).blur();
    await user.keyboard('{Enter}');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('starts with focus on the safe (Cancel) button', () => {
    setup({ variant: 'danger' });
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Modal from './Modal';

describe('Modal', () => {
  it('renders nothing while closed', () => {
    render(<Modal isOpen={false} onClose={vi.fn()} title="Settings">content</Modal>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is an accessible dialog labelled by its title', () => {
    render(<Modal isOpen onClose={vi.fn()} title="Settings"><p>content</p></Modal>);
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('closes with the close button, Escape and a click on the backdrop, but not on inner clicks', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Modal isOpen onClose={onClose} title="Settings"><p>content</p></Modal>);

    await user.click(screen.getByText('content'));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Close dialog' }));
    await user.keyboard('{Escape}');
    // the backdrop is the dialog's parent
    await user.click(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('moves focus into the dialog, keeps Tab inside and restores focus on close', async () => {
    const user = userEvent.setup();
    function Harness({ open }: { open: boolean }) {
      return (
        <>
          <button>opener</button>
          <Modal isOpen={open} onClose={vi.fn()} title="Settings"><input aria-label="name" /></Modal>
        </>
      );
    }

    const { rerender } = render(<Harness open={false} />);
    const opener = screen.getByRole('button', { name: 'opener' });
    opener.focus();

    rerender(<Harness open />);
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();

    await user.tab();
    expect(screen.getByLabelText('name')).toHaveFocus();
    await user.tab(); // last element wraps to the first one
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();
    await user.tab({ shift: true }); // and backwards
    expect(screen.getByLabelText('name')).toHaveFocus();

    rerender(<Harness open={false} />);
    expect(opener).toHaveFocus();
  });

  it('locks page scroll while open', () => {
    const { unmount } = render(<Modal isOpen onClose={vi.fn()} title="Settings">x</Modal>);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});

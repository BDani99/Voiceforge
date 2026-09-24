import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Header from './Header';

const setup = (patch: Partial<React.ComponentProps<typeof Header>> = {}) => {
  const props = { onExport: vi.fn(), handleResetAll: vi.fn(), isLoading: false, totalParagraphs: 2, ...patch };
  render(<MemoryRouter><Header {...props} /></MemoryRouter>);
  return { props, user: userEvent.setup() };
};

describe('Header export menu', () => {
  it('opens a menu with audio and both subtitle formats', async () => {
    const { user } = setup();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Export/ }));
    expect(screen.getByRole('menu', { name: 'Export' })).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      expect.stringContaining('Audio'),
      expect.stringContaining('Subtitles (.srt)'),
      expect.stringContaining('Subtitles (.vtt)'),
    ]);
  });

  it.each([
    ['Audio', 'audio'],
    ['Subtitles (.srt)', 'srt'],
    ['Subtitles (.vtt)', 'vtt'],
  ])('exports %s and closes the menu', async (label, kind) => {
    const { props, user } = setup();
    await user.click(screen.getByRole('button', { name: /Export/ }));
    await user.click(screen.getByRole('menuitem', { name: new RegExp(label.replace(/[().]/g, '\\$&')) }));
    expect(props.onExport).toHaveBeenCalledWith(kind);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes on Escape and on a click elsewhere', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /Export/ }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Export/ }));
    await user.click(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('is disabled while loading or without text', () => {
    setup({ isLoading: true });
    expect(screen.getByRole('button', { name: /Export/ })).toBeDisabled();
  });

  it('is disabled without paragraphs', () => {
    setup({ totalParagraphs: 0 });
    expect(screen.getByRole('button', { name: /Export/ })).toBeDisabled();
  });

  it('reports the expanded state to assistive technology', async () => {
    const { user } = setup();
    const button = screen.getByRole('button', { name: /Export/ });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CustomSelect from './CustomSelect';

const options = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const setup = (props: Partial<React.ComponentProps<typeof CustomSelect<string>>> = {}) => {
  const onChange = vi.fn();
  render(<CustomSelect value="medium" onChange={onChange} options={options} ariaLabel="Pitch" {...props} />);
  return { onChange, user: userEvent.setup(), combobox: screen.getByRole('combobox', { name: 'Pitch' }) };
};

describe('CustomSelect', () => {
  it('shows the selected label or the placeholder', () => {
    setup();
    expect(screen.getByRole('combobox', { name: 'Pitch' })).toHaveTextContent('Medium');
  });

  it('shows the placeholder when the value is unknown', () => {
    setup({ value: 'x', placeholder: 'Pick one' });
    expect(screen.getByRole('combobox', { name: 'Pitch' })).toHaveTextContent('Pick one');
  });

  it('opens a listbox with the current option selected and picks an option by click', async () => {
    const { user, onChange, combobox } = setup();
    expect(combobox).toHaveAttribute('aria-expanded', 'false');

    await user.click(combobox);
    expect(combobox).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('option', { name: 'Medium' })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('option', { name: 'High' }));
    expect(onChange).toHaveBeenCalledWith('high');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('is fully operable with the keyboard', async () => {
    const { user, onChange, combobox } = setup();
    combobox.focus();

    await user.keyboard('{ArrowDown}'); // opens on the current option
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('high');

    await user.keyboard('{ArrowUp}'); // reopen
    await user.keyboard('{Home}{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('low');
  });

  it('closes with Escape without selecting and does not let Escape reach a surrounding dialog', async () => {
    const outer = vi.fn();
    document.addEventListener('keydown', outer);
    const { user, onChange, combobox } = setup();

    await user.click(combobox);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(outer).not.toHaveBeenCalled();
    document.removeEventListener('keydown', outer);
  });

  it('closes when clicking elsewhere', async () => {
    const { user, combobox } = setup();
    await user.click(combobox);
    await user.click(document.body);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('does not open while disabled', async () => {
    const { user, combobox } = setup({ disabled: true });
    await user.click(combobox);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('tells the user when there is nothing to choose', async () => {
    const { user, combobox } = setup({ options: [], value: undefined });
    await user.click(combobox);
    expect(screen.getByText('No options available')).toBeInTheDocument();
  });
});

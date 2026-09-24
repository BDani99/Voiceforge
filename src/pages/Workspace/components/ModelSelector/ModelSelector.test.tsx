import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModelSelector from './ModelSelector';
import type { Voice } from '../../../../types/models';

const voice: Voice = {
  id: 'alicia', display_name: 'Alicia', locale: 'en-US',
  models: ['simba-3.2', 'simba-3.0', 'simba-english'].map((name) => ({ name, languages: [{ locale: 'en-US' }] })),
};

const setup = (props: Partial<React.ComponentProps<typeof ModelSelector>> = {}) => {
  const onChange = vi.fn();
  render(<ModelSelector voice={voice} language="en-US" choice="auto" resolved="simba-3.2" onChange={onChange} {...props} />);
  return { onChange, user: userEvent.setup() };
};

describe('ModelSelector', () => {
  it('shows the automatic choice and says that it was chosen automatically', () => {
    setup();
    expect(screen.getByRole('combobox', { name: 'Model' })).toHaveTextContent('Auto (Simba 3.2)');
    expect(screen.getByText('chosen automatically')).toBeInTheDocument();
  });

  it('lets the user pick a model by hand', async () => {
    const { user, onChange } = setup();
    await user.click(screen.getByRole('combobox', { name: 'Model' }));
    await user.click(screen.getByRole('option', { name: 'Simba 3.0' }));
    expect(onChange).toHaveBeenCalledWith('simba-3.0');
  });

  it('marks legacy models', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('combobox', { name: 'Model' }));
    expect(screen.getByRole('option', { name: 'Simba English (legacy)' })).toBeInTheDocument();
  });

  it('falls back to Auto when the stored choice does not fit the voice', () => {
    setup({ choice: 'simba-multilingual' });
    expect(screen.getByRole('combobox', { name: 'Model' })).toHaveTextContent('Auto (Simba 3.2)');
  });

  it('does not claim "chosen automatically" for a manual choice', () => {
    setup({ choice: 'simba-3.0', resolved: 'simba-3.0' });
    expect(screen.getByRole('combobox', { name: 'Model' })).toHaveTextContent('Simba 3.0');
    expect(screen.queryByText('chosen automatically')).not.toBeInTheDocument();
  });
});

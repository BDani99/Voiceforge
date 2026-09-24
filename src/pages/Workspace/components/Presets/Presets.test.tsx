import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PresetsPanel from './PresetsPanel';
import PresetManagerModal from './PresetManagerModal';
import type { PresetItem, PresetsApi } from '../../../../hooks/usePresets';
import type { Voice } from '../../../../types/models';

const voices: Voice[] = [{ id: 'alicia', display_name: 'Alicia', locale: 'en-US' }];

const item = (patch: Partial<PresetItem> = {}): PresetItem => ({
  id: 'p1', name: 'Calm narrator', settings: { voice: 'alicia', language: 'en-US', model: 'simba-3.2' }, isDefault: false,
  createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-01T10:00:00Z', ...patch,
});

const api = (patch: Partial<PresetsApi> = {}): PresetsApi => ({
  presets: [item()],
  loading: false,
  busy: false,
  activeId: null,
  activePreset: null,
  isModified: false,
  apply: vi.fn(),
  create: vi.fn().mockResolvedValue(null),
  overwrite: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn().mockResolvedValue(null),
  duplicate: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
  setDefault: vi.fn().mockResolvedValue(undefined),
  ...patch,
});

describe('PresetsPanel', () => {
  it('invites the user to save a first preset when there is none', () => {
    render(<PresetsPanel presets={api({ presets: [] })} voices={voices} />);
    expect(screen.getByText(/Save your favourite voice setup/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Manage/ })).not.toBeInTheDocument();
  });

  it('applies a preset from the list', async () => {
    const presets = api();
    render(<PresetsPanel presets={presets} voices={voices} />);
    await userEvent.click(screen.getByRole('combobox', { name: 'Apply a preset' }));
    await userEvent.click(screen.getByRole('option', { name: 'Calm narrator' }));
    expect(presets.apply).toHaveBeenCalledWith('p1');
  });

  it('saves the current setup under a new name', async () => {
    const presets = api();
    render(<PresetsPanel presets={presets} voices={voices} />);

    await userEvent.click(screen.getByRole('button', { name: /Save current as new/ }));
    const save = screen.getByRole('button', { name: /Save preset/ });
    expect(save).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Name of the new preset'), 'Deep voice');
    await userEvent.click(save);

    expect(presets.create).toHaveBeenCalledWith('Deep voice');
    expect(screen.queryByLabelText('Name of the new preset')).not.toBeInTheDocument();
  });

  it('keeps the form open and shows the problem when the name is rejected', async () => {
    const presets = api({ create: vi.fn().mockResolvedValue('You already have a preset with this name.') });
    render(<PresetsPanel presets={presets} voices={voices} />);

    await userEvent.click(screen.getByRole('button', { name: /Save current as new/ }));
    await userEvent.type(screen.getByLabelText('Name of the new preset'), 'Calm narrator');
    await userEvent.click(screen.getByRole('button', { name: /Save preset/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('already have a preset');
    expect(screen.getByLabelText('Name of the new preset')).toBeInTheDocument();
  });

  it('offers to update or revert an active preset that was changed', async () => {
    const preset = item();
    const presets = api({ activeId: 'p1', activePreset: preset, isModified: true });
    render(<PresetsPanel presets={presets} voices={voices} />);

    expect(screen.getByRole('status')).toHaveTextContent('You changed settings after loading “Calm narrator”');
    await userEvent.click(screen.getByRole('button', { name: /Update preset/ }));
    expect(presets.overwrite).toHaveBeenCalledWith('p1');
    await userEvent.click(screen.getByRole('button', { name: /Revert/ }));
    expect(presets.apply).toHaveBeenCalledWith('p1');
  });

  it('opens the manager', async () => {
    render(<PresetsPanel presets={api()} voices={voices} />);
    await userEvent.click(screen.getByRole('button', { name: /Manage \(1\)/ }));
    expect(screen.getByRole('dialog', { name: 'Voice presets' })).toBeInTheDocument();
  });
});

describe('PresetManagerModal', () => {
  const open = (presets: PresetsApi, onClose = vi.fn()) => {
    render(<PresetManagerModal isOpen onClose={onClose} presets={presets} voices={voices} />);
    return { onClose, user: userEvent.setup() };
  };

  it('describes each preset with its voice, language and model', () => {
    open(api());
    const card = screen.getByRole('listitem');
    expect(within(card).getByText('Calm narrator')).toBeInTheDocument();
    expect(card).toHaveTextContent('Alicia · English (US) · Simba 3.2');
  });

  it('applies and closes', async () => {
    const presets = api();
    const { user, onClose } = open(presets);
    await user.click(screen.getByRole('button', { name: /Apply/ }));
    expect(presets.apply).toHaveBeenCalledWith('p1');
    expect(onClose).toHaveBeenCalled();
  });

  it('marks the default and lets it be removed', async () => {
    const presets = api({ presets: [item({ isDefault: true })] });
    const { user } = open(presets);
    expect(screen.getByText('Default')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Remove default/ }));
    expect(presets.setDefault).toHaveBeenCalledWith(null);
  });

  it('makes a preset the default', async () => {
    const presets = api();
    const { user } = open(presets);
    await user.click(screen.getByRole('button', { name: /Make default/ }));
    expect(presets.setDefault).toHaveBeenCalledWith('p1');
  });

  it('renames and shows a rejected name', async () => {
    const rename = vi.fn().mockResolvedValueOnce('You already have a preset with this name.').mockResolvedValueOnce(null);
    const { user } = open(api({ rename }));

    await user.click(screen.getByRole('button', { name: /Rename/ }));
    const field = screen.getByLabelText('New name of Calm narrator');
    await user.clear(field);
    await user.type(field, 'Taken');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already have a preset');

    await user.clear(field);
    await user.type(field, 'Fresh');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(rename).toHaveBeenLastCalledWith('p1', 'Fresh');
    expect(screen.queryByLabelText('New name of Calm narrator')).not.toBeInTheDocument();
  });

  it('asks before deleting', async () => {
    const presets = api();
    const { user } = open(presets);

    await user.click(screen.getByRole('button', { name: /^Delete$/ }));
    expect(presets.remove).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Keep' }));
    expect(presets.remove).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /^Delete$/ }));
    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: /Delete/ }));
    expect(presets.remove).toHaveBeenCalledWith('p1');
  });

  it('filters by search', async () => {
    const presets = api({ presets: [item(), item({ id: 'p2', name: 'Deep voice' })] });
    const { user } = open(presets);
    await user.type(screen.getByRole('searchbox', { name: 'Search presets' }), 'deep');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Deep voice')).toBeInTheDocument();
  });
});

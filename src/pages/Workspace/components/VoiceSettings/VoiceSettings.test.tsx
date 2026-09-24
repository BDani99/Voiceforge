import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VoiceSettings from './VoiceSettings';
import PauseSettings from './PauseSettings';
import { DEFAULT_GLOBAL_DEFAULTS } from '../../../../constants/voiceConstants';

describe('VoiceSettings', () => {
  it('stacks pitch, speed and volume', () => {
    render(<VoiceSettings globalDefaults={DEFAULT_GLOBAL_DEFAULTS} updateGlobalDefaults={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Pitch preset' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Speed preset' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Volume preset' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Custom %' })).toHaveLength(3);
  });

  it('changes a preset', async () => {
    const update = vi.fn();
    render(<VoiceSettings globalDefaults={DEFAULT_GLOBAL_DEFAULTS} updateGlobalDefaults={update} />);
    await userEvent.click(screen.getByRole('combobox', { name: 'Speed preset' }));
    await userEvent.click(screen.getByRole('option', { name: 'Fast' }));
    expect(update).toHaveBeenCalledWith('rate', 'fast');
  });

  it('switches to a custom percentage and edits it', async () => {
    const update = vi.fn();
    const { rerender } = render(<VoiceSettings globalDefaults={DEFAULT_GLOBAL_DEFAULTS} updateGlobalDefaults={update} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Custom %' })[0]!);
    expect(update).toHaveBeenCalledWith('usePitchCustom', true);

    rerender(<VoiceSettings globalDefaults={{ ...DEFAULT_GLOBAL_DEFAULTS, usePitchCustom: true, pitchCustom: 10 }} updateGlobalDefaults={update} />);
    expect(screen.getByText('+10%')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('slider', { name: 'Pitch in percent' }), { target: { value: '-20' } });
    expect(update).toHaveBeenCalledWith('pitchCustom', -20);
    expect(screen.queryByRole('combobox', { name: 'Pitch preset' })).not.toBeInTheDocument();
  });
});

describe('PauseSettings', () => {
  const props = {
    pauseStrength: 'medium', setPauseStrength: vi.fn(), usePauseCustom: false, setUsePauseCustom: vi.fn(), pauseCustomTime: 400, setPauseCustomTime: vi.fn(),
  };

  it('picks a pause strength', async () => {
    const setPauseStrength = vi.fn();
    render(<PauseSettings {...props} setPauseStrength={setPauseStrength} />);
    await userEvent.click(screen.getByRole('combobox', { name: 'Pause strength' }));
    await userEvent.click(screen.getByRole('option', { name: 'Strong' }));
    expect(setPauseStrength).toHaveBeenCalledWith('strong');
  });

  it('uses a custom time in milliseconds', () => {
    const setPauseCustomTime = vi.fn();
    render(<PauseSettings {...props} usePauseCustom setPauseCustomTime={setPauseCustomTime} />);
    expect(screen.getByText('400ms')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('slider', { name: 'Pause after sentences in milliseconds' }), { target: { value: '900' } });
    expect(setPauseCustomTime).toHaveBeenCalledWith(900);
  });
});

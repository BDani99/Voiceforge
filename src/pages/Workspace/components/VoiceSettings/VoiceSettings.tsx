import CustomSelect from '../../../../components/CustomSelect/CustomSelect';
import type { GlobalDefaults } from '../../../../types/models';
import './VoiceSettings.css';

type UpdateDefaults = <K extends keyof GlobalDefaults>(field: K, value: GlobalDefaults[K]) => void;

interface Preset {
  value: string;
  label: string;
}

interface ProsodyControlProps {
  label: string;
  /** Which of pitch, rate, volume this control edits. */
  kind: 'pitch' | 'rate' | 'volume';
  globalDefaults: GlobalDefaults;
  update: UpdateDefaults;
  presets: Preset[];
  min: number;
  max: number;
}

const percent = (value: number): string => `${value >= 0 ? '+' : ''}${value}%`;

/** One prosody setting: a preset list, or a custom percentage on a slider. */
function ProsodyControl({ label, kind, globalDefaults, update, presets, min, max }: ProsodyControlProps) {
  const customField = `${kind}Custom` as const;
  const useCustomField = `use${kind[0]?.toUpperCase()}${kind.slice(1)}Custom` as 'usePitchCustom' | 'useRateCustom' | 'useVolumeCustom';
  const useCustom = globalDefaults[useCustomField];
  const customValue = globalDefaults[customField];

  return (
    <div className="pc">
      <span className="pc__label">{label}</span>
      <div className="pc__row">
        <div className="pc__input">
          {useCustom ? (
            <div className="pc__slider">
              <input
                type="range"
                min={min}
                max={max}
                value={customValue}
                aria-label={`${label} in percent`}
                onChange={(e) => update(customField, parseInt(e.target.value, 10))}
                className="global-range"
              />
              <span className="range-value">{percent(customValue)}</span>
            </div>
          ) : (
            <CustomSelect
              ariaLabel={`${label} preset`}
              value={globalDefaults[kind]}
              onChange={(value) => update(kind, value)}
              options={presets}
            />
          )}
        </div>
        <button
          type="button"
          className={`pc__toggle${useCustom ? ' is-active' : ''}`}
          aria-pressed={useCustom}
          title={useCustom ? 'Switch to a preset' : 'Set a custom percentage'}
          onClick={() => update(useCustomField, !useCustom)}
        >
          Custom %
        </button>
      </div>
    </div>
  );
}

interface VoiceSettingsProps {
  globalDefaults: GlobalDefaults;
  updateGlobalDefaults: UpdateDefaults;
}

/** Pitch, speed and volume, stacked under the voice card. */
function VoiceSettings({ globalDefaults, updateGlobalDefaults }: VoiceSettingsProps) {
  return (
    <div className="pc-list">
      <ProsodyControl
        label="Pitch"
        kind="pitch"
        globalDefaults={globalDefaults}
        update={updateGlobalDefaults}
        min={-50}
        max={50}
        presets={[
          { value: 'x-low', label: 'X-Low' },
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
          { value: 'x-high', label: 'X-High' },
        ]}
      />
      <ProsodyControl
        label="Speed"
        kind="rate"
        globalDefaults={globalDefaults}
        update={updateGlobalDefaults}
        min={-50}
        max={100}
        presets={[
          { value: 'x-slow', label: 'X-Slow' },
          { value: 'slow', label: 'Slow' },
          { value: 'medium', label: 'Medium' },
          { value: 'fast', label: 'Fast' },
          { value: 'x-fast', label: 'X-Fast' },
        ]}
      />
      <ProsodyControl
        label="Volume"
        kind="volume"
        globalDefaults={globalDefaults}
        update={updateGlobalDefaults}
        min={-50}
        max={50}
        presets={[
          { value: 'silent', label: 'Silent' },
          { value: 'x-soft', label: 'X-Soft' },
          { value: 'soft', label: 'Soft' },
          { value: 'medium', label: 'Medium' },
          { value: 'loud', label: 'Loud' },
          { value: 'x-loud', label: 'X-Loud' },
        ]}
      />
    </div>
  );
}

export default VoiceSettings;

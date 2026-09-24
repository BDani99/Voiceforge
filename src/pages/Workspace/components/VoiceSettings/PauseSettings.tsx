import CustomSelect from '../../../../components/CustomSelect/CustomSelect';
import './VoiceSettings.css';

interface PauseSettingsProps {
  pauseStrength: string;
  setPauseStrength: (value: string) => void;
  usePauseCustom: boolean;
  setUsePauseCustom: (value: boolean) => void;
  pauseCustomTime: number;
  setPauseCustomTime: (value: number) => void;
}

const STRENGTHS = [
  { value: 'none', label: 'None' },
  { value: 'x-weak', label: 'X-Weak' },
  { value: 'weak', label: 'Weak' },
  { value: 'medium', label: 'Medium' },
  { value: 'strong', label: 'Strong' },
  { value: 'x-strong', label: 'X-Strong' },
];

/** Length of the pause after every sentence: a preset strength or a custom time in milliseconds. */
export default function PauseSettings({
  pauseStrength,
  setPauseStrength,
  usePauseCustom,
  setUsePauseCustom,
  pauseCustomTime,
  setPauseCustomTime,
}: PauseSettingsProps) {
  return (
    <div className="pc">
      <span className="pc__label">Pauses after sentences</span>
      <div className="pc__row">
        <div className="pc__input">
          {usePauseCustom ? (
            <div className="pc__slider">
              <input
                type="range"
                min={0}
                max={3000}
                step={50}
                value={pauseCustomTime}
                aria-label="Pause after sentences in milliseconds"
                onChange={(e) => setPauseCustomTime(parseInt(e.target.value, 10))}
                className="global-range"
              />
              <span className="range-value">{pauseCustomTime}ms</span>
            </div>
          ) : (
            <CustomSelect ariaLabel="Pause strength" value={pauseStrength} onChange={setPauseStrength} options={STRENGTHS} />
          )}
        </div>
        <button
          type="button"
          className={`pc__toggle${usePauseCustom ? ' is-active' : ''}`}
          aria-pressed={usePauseCustom}
          title={usePauseCustom ? 'Switch to a preset' : 'Set a custom time'}
          onClick={() => setUsePauseCustom(!usePauseCustom)}
        >
          Custom ms
        </button>
      </div>
    </div>
  );
}

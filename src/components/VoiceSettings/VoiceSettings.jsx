import React from 'react';
import PropTypes from 'prop-types';
import { Sliders } from 'lucide-react';
import Accordion from '../Accordion/Accordion';
import CustomSelect from '../CustomSelect/CustomSelect';
import './VoiceSettings.css';

function VoiceSettings({
  globalDefaults,
  updateGlobalDefaults,
  pauseStrength,
  setPauseStrength,
  usePauseCustom,
  setUsePauseCustom,
  pauseCustomTime,
  setPauseCustomTime
}) {
  return (
    <Accordion title="Audio Settings" icon={Sliders} defaultOpen={true}>
      <div className="global-defaults-controls">
        <div className="global-control-group">
          <label>Pitch</label>
          <div className="control-with-custom">
            {globalDefaults.usePitchCustom ? (
              <div className="custom-range">
                <div className="range-container">
                  <input
                    type="range"
                    min="-50"
                    max="50"
                    value={globalDefaults.pitchCustom}
                    onChange={(e) => updateGlobalDefaults('pitchCustom', parseInt(e.target.value))}
                    className="global-range"
                  />
                  <span className="range-value">{globalDefaults.pitchCustom >= 0 ? '+' : ''}{globalDefaults.pitchCustom}%</span>
                </div>
              </div>
            ) : (
              <CustomSelect
                value={globalDefaults.pitch}
                onChange={(val) => updateGlobalDefaults('pitch', val)}
                options={[
                  { value: "x-low", label: "X-Low" },
                  { value: "low", label: "Low" },
                  { value: "medium", label: "Medium" },
                  { value: "high", label: "High" },
                  { value: "x-high", label: "X-High" }
                ]}
              />
            )}
            <button
              onClick={() => updateGlobalDefaults('usePitchCustom', !globalDefaults.usePitchCustom)}
              className="custom-toggle-btn"
              title={globalDefaults.usePitchCustom ? "Switch to preset" : "Switch to custom"}
            >
              Custom %
            </button>
          </div>
        </div>

        <div className="global-control-group">
          <label>Speed</label>
          <div className="control-with-custom">
            {globalDefaults.useRateCustom ? (
              <div className="custom-range">
                <div className="range-container">
                  <input
                    type="range"
                    min="-50"
                    max="100"
                    value={globalDefaults.rateCustom}
                    onChange={(e) => updateGlobalDefaults('rateCustom', parseInt(e.target.value))}
                    className="global-range"
                  />
                  <span className="range-value">{globalDefaults.rateCustom >= 0 ? '+' : ''}{globalDefaults.rateCustom}%</span>
                </div>
              </div>
            ) : (
              <CustomSelect
                value={globalDefaults.rate}
                onChange={(val) => updateGlobalDefaults('rate', val)}
                options={[
                  { value: "x-slow", label: "X-Slow" },
                  { value: "slow", label: "Slow" },
                  { value: "medium", label: "Medium" },
                  { value: "fast", label: "Fast" },
                  { value: "x-fast", label: "X-Fast" }
                ]}
              />
            )}
            <button
              onClick={() => updateGlobalDefaults('useRateCustom', !globalDefaults.useRateCustom)}
              className="custom-toggle-btn"
              title={globalDefaults.useRateCustom ? "Switch to preset" : "Switch to custom"}
            >
              Custom %
            </button>
          </div>
        </div>

        <div className="global-control-group">
          <label>Volume</label>
          <div className="control-with-custom">
            {globalDefaults.useVolumeCustom ? (
              <div className="custom-range">
                <div className="range-container">
                  <input
                    type="range"
                    min="-50"
                    max="50"
                    value={globalDefaults.volumeCustom}
                    onChange={(e) => updateGlobalDefaults('volumeCustom', parseInt(e.target.value))}
                    className="global-range"
                  />
                  <span className="range-value">{globalDefaults.volumeCustom >= 0 ? '+' : ''}{globalDefaults.volumeCustom}%</span>
                </div>
              </div>
            ) : (
              <CustomSelect
                value={globalDefaults.volume}
                onChange={(val) => updateGlobalDefaults('volume', val)}
                options={[
                  { value: "silent", label: "Silent" },
                  { value: "x-soft", label: "X-Soft" },
                  { value: "soft", label: "Soft" },
                  { value: "medium", label: "Medium" },
                  { value: "loud", label: "Loud" },
                  { value: "x-loud", label: "X-Loud" }
                ]}
              />
            )}
            <button
              onClick={() => updateGlobalDefaults('useVolumeCustom', !globalDefaults.useVolumeCustom)}
              className="custom-toggle-btn"
              title={globalDefaults.useVolumeCustom ? "Switch to preset" : "Switch to custom"}
            >
              Custom %
            </button>
          </div>
        </div>

        <div className="global-control-group">
          <label>Sentence Pauses</label>
          <div className="control-with-custom">
            {usePauseCustom ? (
              <div className="custom-range">
                <div className="range-container">
                  <input
                    type="range"
                    min="0"
                    max="3000"
                    step="50"
                    value={pauseCustomTime}
                    onChange={(e) => setPauseCustomTime(parseInt(e.target.value))}
                    className="global-range"
                  />
                  <span className="range-value">{pauseCustomTime}ms</span>
                </div>
              </div>
            ) : (
              <CustomSelect
                value={pauseStrength}
                onChange={(val) => setPauseStrength(val)}
                options={[
                  { value: "none", label: "None" },
                  { value: "x-weak", label: "X-Weak" },
                  { value: "weak", label: "Weak" },
                  { value: "medium", label: "Medium" },
                  { value: "strong", label: "Strong" },
                  { value: "x-strong", label: "X-Strong" }
                ]}
              />
            )}
            <button
              onClick={() => setUsePauseCustom(!usePauseCustom)}
              className="custom-toggle-btn"
              title={usePauseCustom ? "Switch to preset" : "Switch to custom"}
            >
              Custom ms
            </button>
          </div>
        </div>
      </div>
    </Accordion>
  );
}

VoiceSettings.propTypes = {
  globalDefaults: PropTypes.shape({
    pitch: PropTypes.string.isRequired,
    pitchCustom: PropTypes.number.isRequired,
    usePitchCustom: PropTypes.bool.isRequired,
    rate: PropTypes.string.isRequired,
    rateCustom: PropTypes.number.isRequired,
    useRateCustom: PropTypes.bool.isRequired,
    volume: PropTypes.string.isRequired,
    volumeCustom: PropTypes.number.isRequired,
    useVolumeCustom: PropTypes.bool.isRequired,
  }).isRequired,
  updateGlobalDefaults: PropTypes.func.isRequired,
  pauseStrength: PropTypes.string.isRequired,
  setPauseStrength: PropTypes.func.isRequired,
  usePauseCustom: PropTypes.bool.isRequired,
  setUsePauseCustom: PropTypes.func.isRequired,
  pauseCustomTime: PropTypes.number.isRequired,
  setPauseCustomTime: PropTypes.func.isRequired,
};

export default VoiceSettings;

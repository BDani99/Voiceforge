import { useState, type FormEvent } from 'react';
import { Bookmark, RotateCcw, Save, Settings2, Star } from 'lucide-react';
import Accordion from '../../../../components/Accordion/Accordion';
import CustomSelect from '../../../../components/CustomSelect/CustomSelect';
import type { PresetsApi } from '../../../../hooks/usePresets';
import { MAX_PRESET_NAME_LENGTH } from '../../../../utils/presets';
import type { Voice } from '../../../../types/models';
import PresetManagerModal from './PresetManagerModal';
import './Presets.css';

interface PresetsPanelProps {
  presets: PresetsApi;
  voices: Voice[];
}

/** Voice presets in the side panel: pick one, save the current setup, or open the manager. */
export default function PresetsPanel({ presets, voices }: PresetsPanelProps) {
  const { activePreset, isModified, loading } = presets;
  const [managerOpen, setManagerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const startSaving = () => {
    setSaving(true);
    setName('');
    setProblem(null);
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const error = await presets.create(name);
    if (error) {
      setProblem(error);
      return;
    }
    setSaving(false);
  };

  return (
    <Accordion title="Voice presets" icon={Bookmark} defaultOpen>
      <div className="pp">
        {loading ? (
          <p className="pp__hint">Loading your presets...</p>
        ) : presets.presets.length === 0 && !saving ? (
          <div className="pp__empty">
            <p>Save your favourite voice setup once and reuse it in every project.</p>
          </div>
        ) : (
          presets.presets.length > 0 && (
            <>
              <CustomSelect
                ariaLabel="Apply a preset"
                value={presets.activeId ?? ''}
                placeholder="Choose a preset"
                onChange={(id) => presets.apply(id)}
                options={presets.presets.map((p) => ({
                  value: p.id,
                  label: `${p.isDefault ? '★ ' : ''}${p.name}${p.id === presets.activeId && isModified ? ' • modified' : ''}`,
                }))}
              />

              {activePreset && isModified && (
                <div className="pp__modified" role="status">
                  <span>You changed settings after loading “{activePreset.name}”.</span>
                  <div className="pp__modified-actions">
                    <button type="button" className="pp-btn pp-btn--primary" disabled={presets.busy} onClick={() => void presets.overwrite(activePreset.id)}>
                      <Save size={14} /> Update preset
                    </button>
                    <button type="button" className="pp-btn" onClick={() => presets.apply(activePreset.id)}>
                      <RotateCcw size={14} /> Revert
                    </button>
                  </div>
                </div>
              )}

              {activePreset?.isDefault && (
                <p className="pp__hint"><Star size={12} aria-hidden="true" /> This is your default preset.</p>
              )}
            </>
          )
        )}

        {saving ? (
          <form className="pp__form" onSubmit={(e) => void submit(e)}>
            <label className="pp__label" htmlFor="pp-new-name">Name of the new preset</label>
            <input
              id="pp-new-name"
              className="pp__input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setProblem(null);
              }}
              maxLength={MAX_PRESET_NAME_LENGTH}
              placeholder="e.g. Calm narrator"
              autoFocus
              aria-invalid={problem ? 'true' : undefined}
              aria-describedby={problem ? 'pp-new-name-error' : undefined}
            />
            {problem && <p className="pp__error" id="pp-new-name-error" role="alert">{problem}</p>}
            <div className="pp__form-actions">
              <button type="submit" className="pp-btn pp-btn--primary" disabled={presets.busy || !name.trim()}>
                <Save size={14} /> Save preset
              </button>
              <button type="button" className="pp-btn" onClick={() => setSaving(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          <div className="pp__actions">
            <button type="button" className="pp-btn" onClick={startSaving}>
              <Save size={14} /> Save current as new
            </button>
            {presets.presets.length > 0 && (
              <button type="button" className="pp-btn" onClick={() => setManagerOpen(true)}>
                <Settings2 size={14} /> Manage ({presets.presets.length})
              </button>
            )}
          </div>
        )}
      </div>

      <PresetManagerModal isOpen={managerOpen} onClose={() => setManagerOpen(false)} presets={presets} voices={voices} />
    </Accordion>
  );
}

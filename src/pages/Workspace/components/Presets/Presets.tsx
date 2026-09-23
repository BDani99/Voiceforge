import { useState, useEffect, useCallback, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { supabase } from '../../../../services/supabase';
import { notify } from '../../../../utils/notificationService';
import { Save, Trash2, Bookmark } from 'lucide-react';
import { parsePresetSettings } from '../../../../utils/presets';
import type { Tables } from '../../../../types/aliases';
import type { Json } from '../../../../types/database';
import type { PresetSettings } from '../../../../types/models';
import Modal from '../../../../components/Modal/Modal';
import './Presets.css';

type Preset = Tables<'presets'>;

interface PresetsProps {
  currentSettings: PresetSettings;
  onApplyPreset: (settings: PresetSettings) => void;
}

export default function Presets({ currentSettings, onApplyPreset }: PresetsProps) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [newPresetName, setNewPresetName] = useState('');
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activePresetName, setActivePresetName] = useState('');

  const fetchPresets = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from('presets')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPresets(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isModalOpen) void fetchPresets();
  }, [isModalOpen, fetchPresets]);

  const savePreset = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newPresetName.trim()) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');

      const { data, error } = await supabase
        .from('presets')
        .insert({ user_id: user.id, name: newPresetName.trim(), settings: currentSettings as Json })
        .select()
        .single();
      if (error) throw error;
      setPresets((prev) => [data, ...prev]);
      setNewPresetName('');
      notify.success('Preset saved!');
    } catch (err) {
      notify.error(err, 'Failed to save preset');
    }
  };

  const applyPreset = (preset: Preset) => {
    onApplyPreset(parsePresetSettings(preset.settings));
    setActivePresetName(preset.name);
    notify.success(`Applied preset: ${preset.name}`);
    setIsModalOpen(false);
  };

  const deletePreset = async (id: string, e: MouseEvent) => {
    e.stopPropagation();
    try {
      const { error } = await supabase.from('presets').delete().eq('id', id);
      if (error) throw error;
      setPresets((prev) => prev.filter(p => p.id !== id));
      notify.success('Preset deleted');
    } catch (err) {
      notify.error(err, 'Failed to delete preset');
    }
  };

  return (
    <>
      <button className="presets-open-btn" onClick={() => setIsModalOpen(true)}>
        <Bookmark size={18} />
        Voice Presets
        {presets.length > 0 && <span className="presets-count">{presets.length}</span>}
      </button>
      {activePresetName && (
        <div className="active-preset-indicator">
          <Bookmark size={12} />
          <span>{activePresetName}</span>
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Voice Presets">
        <form onSubmit={savePreset} className="preset-save-form">
          <input aria-label="New Preset Name"
            placeholder="New Preset Name"
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            className="preset-input"
          />
          <button type="submit" disabled={!newPresetName.trim()} className="save-preset-btn">
            <Save size={16} /> Save Current
          </button>
        </form>

        {loading ? (
          <div className="presets-loading">Loading presets...</div>
        ) : presets.length === 0 ? (
          <div className="empty-presets">No saved presets yet.</div>
        ) : (
          <div className="presets-grid">
            {presets.map(preset => (
              <div
                key={preset.id}
                className="preset-card"
                role="button"
                tabIndex={0}
                aria-label={`Apply preset ${preset.name}`}
                onClick={() => applyPreset(preset)}
                onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
                  if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    applyPreset(preset);
                  }
                }}
              >
                <div className="preset-card-name">{preset.name}</div>
                <div className="preset-card-footer">
                  <span className="preset-card-date">
                    {preset.created_at ? new Date(preset.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                  </span>
                  <button
                    className="preset-card-delete"
                    onClick={(e) => deletePreset(preset.id, e)}
                    title="Delete" aria-label="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}

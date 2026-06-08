import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { toast } from 'react-hot-toast';
import { Save, Download, Trash2, Bookmark } from 'lucide-react';
import Modal from '../Modal/Modal';
import './Presets.css';

export default function Presets({ currentSettings, onApplyPreset }) {
  const [presets, setPresets] = useState([]);
  const [newPresetName, setNewPresetName] = useState('');
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchPresets = async () => {
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
      setPresets(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isModalOpen) fetchPresets();
  }, [isModalOpen]);

  const savePreset = async (e) => {
    e.preventDefault();
    if (!newPresetName.trim()) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('presets')
        .insert([{ user_id: user.id, name: newPresetName.trim(), settings: currentSettings }])
        .select();
      if (error) throw error;
      setPresets([data[0], ...presets]);
      setNewPresetName('');
      toast.success('Preset saved!');
    } catch (err) {
      toast.error('Failed to save preset');
    }
  };

  const applyPreset = (preset) => {
    onApplyPreset(preset.settings);
    toast.success(`Applied preset: ${preset.name}`);
    setIsModalOpen(false);
  };

  const deletePreset = async (id, e) => {
    e.stopPropagation();
    try {
      const { error } = await supabase.from('presets').delete().eq('id', id);
      if (error) throw error;
      setPresets(presets.filter(p => p.id !== id));
      toast.success('Preset deleted');
    } catch (err) {
      toast.error('Failed to delete preset');
    }
  };

  return (
    <>
      <button className="presets-open-btn" onClick={() => setIsModalOpen(true)}>
        <Bookmark size={18} />
        Voice Presets
        {presets.length > 0 && <span className="presets-count">{presets.length}</span>}
      </button>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Voice Presets">
        <form onSubmit={savePreset} className="preset-save-form">
          <input
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
              <div key={preset.id} className="preset-card" onClick={() => applyPreset(preset)}>
                <div className="preset-card-name">{preset.name}</div>
                <div className="preset-card-footer">
                  <span className="preset-card-date">
                    {new Date(preset.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  <button
                    className="preset-card-delete"
                    onClick={(e) => deletePreset(preset.id, e)}
                    title="Delete"
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

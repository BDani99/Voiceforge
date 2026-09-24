import { useMemo, useState, type FormEvent } from 'react';
import { Check, Copy, Pencil, Play, RefreshCw, Search, Star, Trash2 } from 'lucide-react';
import Modal from '../../../../components/Modal/Modal';
import type { PresetItem, PresetsApi } from '../../../../hooks/usePresets';
import { MAX_PRESET_NAME_LENGTH, summarizePreset } from '../../../../utils/presets';
import type { Voice } from '../../../../types/models';
import './Presets.css';

interface PresetManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  presets: PresetsApi;
  voices: Voice[];
}

const formatDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

/** All presets with their details and every action: apply, update, rename, duplicate, default, delete. */
export default function PresetManagerModal({ isOpen, onClose, presets, voices }: PresetManagerModalProps) {
  const [query, setQuery] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameProblem, setRenameProblem] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return presets.presets.filter((p) => words.every((w) => p.name.toLowerCase().includes(w)));
  }, [presets.presets, query]);

  const startRename = (preset: PresetItem) => {
    setDeletingId(null);
    setRenamingId(preset.id);
    setRenameValue(preset.name);
    setRenameProblem(null);
  };

  const submitRename = async (e: FormEvent<HTMLFormElement>, id: string) => {
    e.preventDefault();
    const error = await presets.rename(id, renameValue);
    if (error) setRenameProblem(error);
    else setRenamingId(null);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Voice presets" size="lg">
      <div className="pm">
        <div className="pm__search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search presets..."
            aria-label="Search presets"
          />
        </div>

        {visible.length === 0 ? (
          <p className="pm__empty">{presets.presets.length === 0 ? 'You have no presets yet.' : 'No preset matches your search.'}</p>
        ) : (
          <ul className="pm__list" aria-label="Presets">
            {visible.map((preset) => {
              const summary = summarizePreset(preset.settings, voices);
              const active = preset.id === presets.activeId;
              const modified = active && presets.isModified;

              return (
                <li key={preset.id} className={`pm-card${active ? ' pm-card--active' : ''}`}>
                  <div className="pm-card__head">
                    {renamingId === preset.id ? (
                      <form className="pm-card__rename" onSubmit={(e) => void submitRename(e, preset.id)}>
                        <input
                          value={renameValue}
                          onChange={(e) => {
                            setRenameValue(e.target.value);
                            setRenameProblem(null);
                          }}
                          maxLength={MAX_PRESET_NAME_LENGTH}
                          aria-label={`New name of ${preset.name}`}
                          aria-invalid={renameProblem ? 'true' : undefined}
                          autoFocus
                        />
                        <button type="submit" className="pp-btn pp-btn--primary" disabled={presets.busy}><Check size={14} /> Save</button>
                        <button type="button" className="pp-btn" onClick={() => setRenamingId(null)}>Cancel</button>
                      </form>
                    ) : (
                      <h3 className="pm-card__name">
                        {preset.name}
                        {preset.isDefault && <span className="pm-badge pm-badge--default"><Star size={11} /> Default</span>}
                        {active && <span className="pm-badge pm-badge--active">{modified ? 'Active, modified' : 'Active'}</span>}
                      </h3>
                    )}
                  </div>
                  {renamingId === preset.id && renameProblem && <p className="pp__error" role="alert">{renameProblem}</p>}

                  <p className="pm-card__voice">
                    <strong>{summary.voice}</strong>
                    {summary.language && <span> · {summary.language}</span>}
                    <span> · {summary.model}</span>
                  </p>
                  <div className="pm-card__chips">
                    {[...summary.tuning, ...summary.style].map((chip) => <span key={chip} className="pm-chip">{chip}</span>)}
                  </div>
                  <p className="pm-card__date">
                    {preset.updatedAt && preset.updatedAt !== preset.createdAt
                      ? `Updated ${formatDate(preset.updatedAt)}`
                      : `Created ${formatDate(preset.createdAt)}`}
                  </p>

                  {deletingId === preset.id ? (
                    <div className="pm-card__confirm" role="alert">
                      <span>Delete “{preset.name}” permanently?</span>
                      <button
                        type="button"
                        className="pp-btn pp-btn--danger"
                        disabled={presets.busy}
                        onClick={() => {
                          setDeletingId(null);
                          void presets.remove(preset.id);
                        }}
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                      <button type="button" className="pp-btn" onClick={() => setDeletingId(null)}>Keep</button>
                    </div>
                  ) : (
                    <div className="pm-card__actions">
                      <button type="button" className="pp-btn pp-btn--primary" onClick={() => { presets.apply(preset.id); onClose(); }}>
                        <Play size={14} /> Apply
                      </button>
                      <button
                        type="button"
                        className="pp-btn"
                        disabled={presets.busy}
                        title="Replace this preset with the current settings"
                        onClick={() => void presets.overwrite(preset.id)}
                      >
                        <RefreshCw size={14} /> Overwrite with current
                      </button>
                      <button type="button" className="pp-btn" onClick={() => startRename(preset)}><Pencil size={14} /> Rename</button>
                      <button type="button" className="pp-btn" disabled={presets.busy} onClick={() => void presets.duplicate(preset.id)}>
                        <Copy size={14} /> Duplicate
                      </button>
                      <button
                        type="button"
                        className="pp-btn"
                        disabled={presets.busy}
                        aria-pressed={preset.isDefault}
                        onClick={() => void presets.setDefault(preset.isDefault ? null : preset.id)}
                      >
                        <Star size={14} /> {preset.isDefault ? 'Remove default' : 'Make default'}
                      </button>
                      <button type="button" className="pp-btn pp-btn--danger-ghost" onClick={() => { setRenamingId(null); setDeletingId(preset.id); }}>
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className="pm__note">
          The default preset is applied automatically when you open a project that has no generated audio yet.
        </p>
      </div>
    </Modal>
  );
}

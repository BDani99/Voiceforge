import { useState } from 'react';
import { Mic, Plus, Trash2 } from 'lucide-react';
import ConfirmModal from '../../../components/ConfirmModal/ConfirmModal';
import { useConfirm } from '../../../hooks/useConfirm';
import type { VoiceCloningApi } from '../../../hooks/useVoiceCloning';
import CloneVoiceModal from './CloneVoiceModal';
import './VoiceCloning.css';

const GENDER_LABELS: Record<string, string> = { male: 'Male', female: 'Female', not_specified: 'Unspecified gender' };

const formatDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

interface MyClonedVoicesProps {
  cloning: VoiceCloningApi;
}

/** Lists the user's Instant Voice Cloning voices and lets them create or delete one. */
export default function MyClonedVoices({ cloning }: MyClonedVoicesProps) {
  const { voices, loading, busy, remove } = cloning;
  const [modalOpen, setModalOpen] = useState(false);
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();

  const handleDelete = async (id: string, name: string) => {
    const confirmed = await confirm({
      title: 'Delete cloned voice',
      message: `Delete "${name}"? It will no longer be usable in any project. This cannot be undone.`,
      confirmLabel: 'Delete voice',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (confirmed) await remove(id);
  };

  return (
    <div className="settings-section">
      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        details={confirmState.details}
        confirmLabel={confirmState.confirmLabel}
        cancelLabel={confirmState.cancelLabel}
        variant={confirmState.variant}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
      <CloneVoiceModal isOpen={modalOpen} onClose={() => setModalOpen(false)} cloning={cloning} />

      <div className="settings-section-header">
        <Mic size={20} />
        <div>
          <h3>My Cloned Voices</h3>
          <p>Clone your own voice, or someone else's with their consent, and use it in your projects.</p>
        </div>
      </div>

      <div className="settings-body vc-body">
        <button type="button" className="btn-save" onClick={() => setModalOpen(true)}>
          <Plus size={16} /> Clone a new voice
        </button>

        {loading ? (
          <p className="vc-hint">Loading your voices...</p>
        ) : voices.length === 0 ? (
          <p className="vc-hint">You have not cloned any voices yet.</p>
        ) : (
          <ul className="vc-list" aria-label="Your cloned voices">
            {voices.map((voice) => (
              <li key={voice.id} className="vc-card">
                <div className="vc-card__text">
                  <span className="vc-card__name">{voice.display_name}</span>
                  <span className="vc-card__meta">
                    {GENDER_LABELS[voice.gender] ?? voice.gender}
                    {voice.locale ? ` · ${voice.locale}` : ''} · Created {formatDate(voice.created_at)}
                  </span>
                </div>
                <button
                  type="button"
                  className="vc-card__delete"
                  disabled={busy}
                  aria-label={`Delete ${voice.display_name}`}
                  onClick={() => void handleDelete(voice.id, voice.display_name)}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

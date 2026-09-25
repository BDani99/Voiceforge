import { useEffect, useMemo, useState } from 'react';
import { Check, Search, Sparkles, X } from 'lucide-react';
import Modal from '../../../../components/Modal/Modal';
import CustomSelect from '../../../../components/CustomSelect/CustomSelect';
import type { PreviewPlayer } from '../../../../hooks/usePreviewPlayer';
import {
  EMPTY_FILTERS,
  MODEL_CATALOG,
  filterVoices,
  genderLabel,
  isClonedVoice,
  languageOptions,
  localeLabel,
  modelLabel,
  tagLabel,
  voiceUseCaseOptions,
  voiceUseCases,
  voiceModels,
  voiceName,
  type VoiceFilters,
} from '../../../../utils/voices';
import type { Voice } from '../../../../types/models';
import SampleButton from './SampleButton';
import VoiceAvatar from './VoiceAvatar';
import './VoicePicker.css';

const PAGE_SIZE = 40;

interface VoicePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  voices: Voice[];
  selectedVoiceId: string;
  /** Language of the text: the picker starts filtered to it. */
  language: string;
  player: PreviewPlayer;
  onSelect: (voice: Voice) => void;
}

const GENDERS = [
  { value: '', label: 'All' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
];

/** Searchable, filterable list of all voices with sample playback. */
export default function VoicePickerModal({ isOpen, onClose, voices, selectedVoiceId, language, player, onSelect }: VoicePickerModalProps) {
  const languages = useMemo(() => languageOptions(voices), [voices]);
  const useCasesAvailable = useMemo(() => voiceUseCaseOptions(voices), [voices]);
  const modelsAvailable = useMemo(
    () => Object.keys(MODEL_CATALOG).filter((m) => voices.some((v) => voiceModels(v).includes(m))),
    [voices],
  );

  const initialFilters = (): VoiceFilters => ({
    ...EMPTY_FILTERS,
    locale: languages.some((l) => l.locale === language) ? language : '',
  });

  const [filters, setFilters] = useState<VoiceFilters>(initialFilters);
  const [visible, setVisible] = useState(PAGE_SIZE);

  // Every time the picker opens it starts at the current language; a sample never keeps playing when it closes.
  const { stop } = player;
  useEffect(() => {
    if (isOpen) {
      setFilters(initialFilters());
      setVisible(PAGE_SIZE);
    } else {
      stop();
    }
    // initialFilters only depends on the values listed here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, language, stop]);

  const update = (patch: Partial<VoiceFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setVisible(PAGE_SIZE);
  };

  const results = useMemo(() => filterVoices(voices, filters), [voices, filters]);
  const shown = results.slice(0, visible);
  const hasFilters = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Choose a voice" size="xl">
      <div className="vp">
        <div className="vp__filters">
          <div className="vp__search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={filters.query}
              onChange={(e) => update({ query: e.target.value })}
              placeholder="Search by name, language or style..."
              aria-label="Search voices"
              autoFocus
            />
            {filters.query && (
              <button type="button" className="vp__clear" aria-label="Clear search" onClick={() => update({ query: '' })}>
                <X size={14} />
              </button>
            )}
          </div>

          <div className="vp__selects">
            <div className="vp__field">
              <span className="vp__label" id="vp-language-label">Language</span>
              <CustomSelect
                value={filters.locale}
                onChange={(locale) => update({ locale })}
                ariaLabel="Filter by language"
                options={[
                  { value: '', label: `All languages (${voices.length})` },
                  ...languages.map((l) => ({ value: l.locale, label: `${l.label} (${l.count})` })),
                ]}
              />
            </div>
            <div className="vp__field">
              <span className="vp__label">Model</span>
              <CustomSelect
                value={filters.model}
                onChange={(model) => update({ model })}
                ariaLabel="Filter by model"
                options={[{ value: '', label: 'Any model' }, ...modelsAvailable.map((m) => ({ value: m, label: modelLabel(m) }))]}
              />
            </div>
            <div className="vp__field">
              <span className="vp__label">Use case</span>
              <CustomSelect
                value={filters.useCase}
                onChange={(useCase) => update({ useCase })}
                ariaLabel="Filter by use case"
                options={[
                  { value: '', label: 'Any use case' },
                  ...useCasesAvailable.map((u) => ({ value: u.value, label: `${tagLabel(u.value)} (${u.count})` })),
                ]}
              />
            </div>
          </div>

          <div className="vp__bar">
            <div className="vp__segmented" role="group" aria-label="Filter by gender">
              {GENDERS.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  className={filters.gender === g.value ? 'is-active' : ''}
                  aria-pressed={filters.gender === g.value}
                  onClick={() => update({ gender: g.value })}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <span className="vp__count" role="status">
              {results.length} {results.length === 1 ? 'voice' : 'voices'}
            </span>
            {hasFilters && (
              <button type="button" className="vp__reset" onClick={() => update({ ...EMPTY_FILTERS })}>
                Reset filters
              </button>
            )}
          </div>
        </div>

        {results.length === 0 ? (
          <div className="vp__empty">
            <p>No voice matches these filters.</p>
            <button type="button" className="vp__reset" onClick={() => update({ ...EMPTY_FILTERS })}>Show all voices</button>
          </div>
        ) : (
          <ul className="vp__list" aria-label="Voices">
            {shown.map((voice) => {
              const selected = voice.id === selectedVoiceId;
              const models = voiceModels(voice).filter((m) => !MODEL_CATALOG[m]?.legacy);
              return (
                <li key={voice.id} className={`vp-row${selected ? ' vp-row--selected' : ''}`}>
                  <button
                    type="button"
                    className="vp-row__main"
                    aria-current={selected ? 'true' : undefined}
                    aria-label={`Use ${voiceName(voice)}`}
                    onClick={() => {
                      onSelect(voice);
                      onClose();
                    }}
                  >
                    <VoiceAvatar voice={voice} size={44} />
                    <span className="vp-row__text">
                      <span className="vp-row__name">
                        {voiceName(voice)}
                        {selected && <Check size={14} aria-hidden="true" />}
                      </span>
                      <span className="vp-row__meta">
                        {[genderLabel(voice.gender), localeLabel(voice.locale ?? '')].filter(Boolean).join(' · ')}
                      </span>
                      <span className="vp-row__chips">
                        {models.map((m) => <span key={m} className="vp-chip vp-chip--model">{modelLabel(m)}</span>)}
                        {isClonedVoice(voice) && (
                          <span className="vp-chip vp-chip--cloned"><Sparkles size={11} aria-hidden="true" /> Cloned</span>
                        )}
                        {voiceUseCases(voice).slice(0, 3).map((t) => <span key={t} className="vp-chip">{t}</span>)}
                      </span>
                    </span>
                  </button>
                  <SampleButton voice={voice} player={player} />
                </li>
              );
            })}
          </ul>
        )}

        {results.length > shown.length && (
          <button type="button" className="vp__more" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
            Show {Math.min(PAGE_SIZE, results.length - shown.length)} more ({results.length - shown.length} left)
          </button>
        )}
      </div>
    </Modal>
  );
}

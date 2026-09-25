import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { AlertTriangle, Mic, Square, Upload } from 'lucide-react';
import Modal from '../../../components/Modal/Modal';
import CustomSelect from '../../../components/CustomSelect/CustomSelect';
import { useMediaRecorder } from '../../../hooks/useMediaRecorder';
import { useVoiceCloneCost } from '../../../hooks/useVoiceCloneCost';
import type { VoiceCloningApi } from '../../../hooks/useVoiceCloning';
import type { ConsentChallenge } from '../../../services/voiceCloning';
import { SUPPORTED_LANGUAGES } from '../../../constants/voiceConstants';
import './VoiceCloning.css';

type Step = 'sample' | 'consent' | 'submitting' | 'error';

const GENDER_OPTIONS = [
  { value: 'not_specified', label: 'Prefer not to say' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
];

const formatSeconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

interface CloneVoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  cloning: VoiceCloningApi;
}

/**
 * A two-step wizard: (1) a name and a 10-30s sample of the voice, (2) reading Speechify's consent
 * phrase aloud, which proves the speaker agreed to have their voice cloned. See Speechify's
 * voice-cloning docs: a create can only succeed with a verified consent recording.
 */
export default function CloneVoiceModal({ isOpen, onClose, cloning }: CloneVoiceModalProps) {
  const [step, setStep] = useState<Step>('sample');
  const [voiceName, setVoiceName] = useState('');
  const [speakerName, setSpeakerName] = useState('');
  const [gender, setGender] = useState('not_specified');
  const [locale, setLocale] = useState('');
  const [uploadedSample, setUploadedSample] = useState<File | null>(null);
  const [challenge, setChallenge] = useState<ConsentChallenge | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sampleRecorder = useMediaRecorder();
  const consentRecorder = useMediaRecorder();
  const cloneCost = useVoiceCloneCost();

  const sample: Blob | null = uploadedSample ?? sampleRecorder.clip?.blob ?? null;
  const canContinue = !!sample && voiceName.trim().length > 0 && speakerName.trim().length > 0;

  // One object URL per uploaded file, released when it is replaced or the modal closes.
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!uploadedSample) {
      setUploadedUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(uploadedSample);
    setUploadedUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [uploadedSample]);

  const close = () => {
    if (step === 'submitting') return; // do not lose an in-flight request
    onClose();
  };

  const pickFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setUploadedSample(file);
    if (file) sampleRecorder.reset();
  };

  const startConsentStep = async () => {
    const result = await cloning.startConsent(speakerName.trim());
    if (result) {
      setChallenge(result);
      consentRecorder.reset();
      setStep('consent');
    }
  };

  const handleSampleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (canContinue) void startConsentStep();
  };

  const handleCreate = async () => {
    if (!sample || !challenge || !consentRecorder.clip) return;
    setStep('submitting');
    const error = await cloning.create({
      name: voiceName.trim(),
      consentChallengeId: challenge.id,
      gender: gender as 'male' | 'female' | 'not_specified',
      ...(locale ? { locale } : {}),
      sample,
      consentRecording: consentRecorder.clip.blob,
    });
    if (error) {
      setErrorMessage(error);
      setStep('error');
    } else {
      onClose();
    }
  };

  // The consent challenge is spent whether the create succeeds or fails: trying again needs a fresh one.
  const retryConsent = () => void startConsentStep();

  const startOver = () => {
    setStep('sample');
    setVoiceName('');
    setSpeakerName('');
    setGender('not_specified');
    setLocale('');
    setUploadedSample(null);
    setChallenge(null);
    setErrorMessage(null);
    sampleRecorder.reset();
    consentRecorder.reset();
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title="Clone a voice" size="md">
      {step === 'sample' && (
        <form className="vc-wizard" onSubmit={handleSampleSubmit}>
          <p className="vc-hint">
            Provide 10-30 seconds of clear speech from the person whose voice you want to clone. They will need
            to record a short consent phrase in the next step.
          </p>

          <div className="form-group">
            <label htmlFor="cv-name">Voice name</label>
            <input id="cv-name" value={voiceName} onChange={(e) => setVoiceName(e.target.value)} maxLength={200} placeholder="e.g. My narrator voice" required />
          </div>

          <div className="form-group">
            <label htmlFor="cv-speaker">Speaker's full name</label>
            <input id="cv-speaker" value={speakerName} onChange={(e) => setSpeakerName(e.target.value)} maxLength={200} placeholder="The person being cloned" required />
            <p className="vc-field-hint">Shown on the consent recording as proof of who agreed to this.</p>
          </div>

          <div className="vc-row">
            <div className="form-group">
              <label>Gender</label>
              <CustomSelect value={gender} onChange={setGender} options={GENDER_OPTIONS} ariaLabel="Gender" />
            </div>
            <div className="form-group">
              <label>Language (optional)</label>
              <CustomSelect
                value={locale}
                onChange={setLocale}
                ariaLabel="Language"
                placeholder="Any language"
                options={[{ value: '', label: 'Any language' }, ...SUPPORTED_LANGUAGES.map((l) => ({ value: l.code, label: l.name }))]}
              />
            </div>
          </div>

          <div className="form-group">
            <span className="vc-field-hint" style={{ marginBottom: 6, display: 'block' }}>Voice sample (10-30 seconds)</span>
            <div className="vc-sample-row">
              {sampleRecorder.status !== 'recording' ? (
                <button type="button" className="vc-btn" onClick={() => void sampleRecorder.start()}>
                  <Mic size={14} /> Record
                </button>
              ) : (
                <button type="button" className="vc-btn vc-btn--primary" onClick={sampleRecorder.stop}>
                  <Square size={14} /> Stop ({formatSeconds(sampleRecorder.elapsedMs)})
                </button>
              )}
              <button type="button" className="vc-btn" onClick={() => fileInputRef.current?.click()}>
                <Upload size={14} /> Upload file
              </button>
              <input ref={fileInputRef} type="file" accept="audio/*" className="vc-file-input" onChange={pickFile} aria-label="Upload a voice sample file" />
            </div>
            {sampleRecorder.error && <p className="vc-inline-error">{sampleRecorder.error}</p>}
            {sample && (
              <audio controls src={uploadedSample ? (uploadedUrl ?? undefined) : sampleRecorder.clip?.url} className="vc-audio" />
            )}
            {uploadedSample && <p className="vc-field-hint">{uploadedSample.name}</p>}
          </div>

          <p className="vc-field-hint">Cloning a voice costs {cloneCost.toLocaleString()} credits, charged once it is created.</p>

          <div className="vc-actions">
            <button type="button" className="vc-btn" onClick={close}>Cancel</button>
            <button type="submit" className="vc-btn vc-btn--primary" disabled={!canContinue}>Continue to consent</button>
          </div>
        </form>
      )}

      {(step === 'consent' || step === 'submitting') && challenge && (
        <div className="vc-wizard">
          <p className="vc-hint">
            Have <strong>{speakerName}</strong> read this phrase aloud, exactly as written. This recording is kept as proof of consent.
          </p>
          <p className="vc-phrase" role="note">{challenge.phrase}</p>

          <div className="vc-sample-row">
            {consentRecorder.status !== 'recording' ? (
              <button type="button" className="vc-btn" onClick={() => void consentRecorder.start()} disabled={step === 'submitting'}>
                <Mic size={14} /> {consentRecorder.clip ? 'Record again' : 'Record'}
              </button>
            ) : (
              <button type="button" className="vc-btn vc-btn--primary" onClick={consentRecorder.stop}>
                <Square size={14} /> Stop ({formatSeconds(consentRecorder.elapsedMs)})
              </button>
            )}
          </div>
          {consentRecorder.error && <p className="vc-inline-error">{consentRecorder.error}</p>}
          {consentRecorder.clip && <audio controls src={consentRecorder.clip.url} className="vc-audio" />}

          <div className="vc-actions">
            <button type="button" className="vc-btn" onClick={close} disabled={step === 'submitting'}>Cancel</button>
            <button
              type="button"
              className="vc-btn vc-btn--primary"
              disabled={!consentRecorder.clip || step === 'submitting'}
              onClick={() => void handleCreate()}
            >
              {step === 'submitting' ? 'Creating voice...' : 'Create voice'}
            </button>
          </div>
        </div>
      )}

      {step === 'error' && (
        <div className="vc-wizard">
          <p className="vc-error" role="alert"><AlertTriangle size={16} /> {errorMessage}</p>
          <p className="vc-hint">Your voice sample was kept. You can record the consent phrase again with a new one.</p>
          <div className="vc-actions">
            <button type="button" className="vc-btn" onClick={startOver}>Start over</button>
            <button type="button" className="vc-btn vc-btn--primary" onClick={retryConsent}>Get a new phrase</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

import CustomSelect from '../../../../components/CustomSelect/CustomSelect';
import { AUTO_MODEL, MODEL_CATALOG, autoModel, compatibleModels, modelLabel } from '../../../../utils/voices';
import type { Voice } from '../../../../types/models';
import './ModelSelector.css';

interface ModelSelectorProps {
  voice: Voice | undefined;
  language: string;
  /** "auto" or a model name. */
  choice: string;
  /** The model that is really used. */
  resolved: string;
  onChange: (choice: string) => void;
  disabled?: boolean;
}

/** Lets the app pick the model for the voice and language, or the user pick one by hand. */
export default function ModelSelector({ voice, language, choice, resolved, onChange, disabled = false }: ModelSelectorProps) {
  const compatible = compatibleModels(voice, language);
  const automatic = autoModel(voice, language);
  // A stored choice that no longer fits the voice or language is shown as "Auto".
  const shown = choice !== AUTO_MODEL && compatible.includes(choice) ? choice : AUTO_MODEL;
  const info = MODEL_CATALOG[resolved];

  return (
    <div className="ms">
      <CustomSelect
        ariaLabel="Model"
        value={shown}
        onChange={onChange}
        disabled={disabled}
        options={[
          { value: AUTO_MODEL, label: `Auto (${modelLabel(automatic)})` },
          ...compatible.map((m) => ({ value: m, label: `${modelLabel(m)}${MODEL_CATALOG[m]?.legacy ? ' (legacy)' : ''}` })),
        ]}
      />
      {info && (
        <p className="ms__info">
          <strong>{info.label}</strong>
          {shown === AUTO_MODEL && <span className="ms__auto">chosen automatically</span>}
          <span className="ms__description">{info.description}</span>
        </p>
      )}
    </div>
  );
}

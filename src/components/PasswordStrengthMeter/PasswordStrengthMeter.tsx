import { useMemo } from 'react';
import { passwordStrength, strengthLabel } from '../../utils/passwordPolicy';
import './PasswordStrengthMeter.css';

interface PasswordStrengthMeterProps {
  password: string;
}

const LEVELS = [1, 2, 3, 4] as const;

/** Four segments that fill and change colour with the strength of the password. */
export default function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  const score = useMemo(() => passwordStrength(password), [password]);
  if (password.length === 0) return null;

  return (
    <div className="pw-meter" role="status" aria-label={`Password strength: ${strengthLabel(score)}`}>
      <div className="pw-meter__bars" aria-hidden="true">
        {LEVELS.map((level) => (
          <span
            key={level}
            className={`pw-meter__bar${score >= level ? ` pw-meter__bar--filled pw-meter__bar--level-${score}` : ''}`}
          />
        ))}
      </div>
      <span className={`pw-meter__label pw-meter__label--level-${score}`}>{strengthLabel(score)}</span>
    </div>
  );
}

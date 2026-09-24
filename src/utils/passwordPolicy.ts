export const MIN_PASSWORD_LENGTH = 8;

/** 0 (empty) to 4 (strong): length steps plus an uppercase letter and a digit or symbol. */
export function passwordStrength(password: string): number {
  let score = 0;
  if (password.length > 5) score += 1;
  if (password.length > 8) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9!@#$%^&*]/.test(password)) score += 1;
  return score;
}

const STRENGTH_LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong'] as const;

export const strengthLabel = (score: number): string => STRENGTH_LABELS[Math.min(Math.max(score, 0), 4)] ?? '';

/** Returns an error message for an unacceptable password, or null when it is fine. */
export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (passwordStrength(password) < 2) return 'Password is too weak.';
  return null;
}

const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range/';

async function sha1Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/**
 * Checks the password against the Have I Been Pwned breach list. Only the first five
 * characters of the SHA-1 hash leave the browser (k-anonymity), never the password.
 * The check fails open: when the service cannot be reached the password is accepted,
 * signing up must not depend on a third party being online.
 */
export async function isPasswordBreached(password: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    const response = await fetchImpl(`${HIBP_RANGE_URL}${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return false;

    const body = await response.text();
    return body.split('\n').some((line) => {
      const [candidate, count] = line.trim().split(':');
      // Padding entries have a count of 0 and must not be treated as matches.
      return candidate === suffix && Number(count) > 0;
    });
  } catch {
    return false;
  }
}

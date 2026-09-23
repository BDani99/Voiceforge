import { describe, it, expect, vi } from 'vitest';
import { isPasswordBreached, passwordStrength, validatePassword } from './passwordPolicy';

// SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
const respond = (body: string, ok = true) =>
  vi.fn().mockResolvedValue({ ok, text: () => Promise.resolve(body) });

describe('validatePassword', () => {
  it('requires a minimum length and some variety', () => {
    expect(validatePassword('short')).toMatch(/at least 8/);
    expect(validatePassword('aaaaaaaa')).toBe('Password is too weak.');
    expect(validatePassword('Abcdefg1')).toBeNull();
  });

  it('scores strength between 0 and 4', () => {
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('Abcdefghi1')).toBe(4);
  });
});

describe('isPasswordBreached', () => {
  it('sends only the 5 character hash prefix and finds a matching suffix', async () => {
    const fetchMock = respond('0000000000000000000000000000000000A:1\r\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:3861493');
    await expect(isPasswordBreached('password', fetchMock as unknown as typeof fetch)).resolves.toBe(true);

    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toBe('https://api.pwnedpasswords.com/range/5BAA6');
    expect(url.split('/').pop()).toHaveLength(5); // nothing but the hash prefix
  });

  it('ignores padding entries with a count of 0', async () => {
    const fetchMock = respond('1E4C9B93F3F0682250B6CF8331B7EE68FD8:0');
    await expect(isPasswordBreached('password', fetchMock as unknown as typeof fetch)).resolves.toBe(false);
  });

  it('is not breached when the suffix is absent', async () => {
    await expect(isPasswordBreached('password', respond('ABCDEF:2') as unknown as typeof fetch)).resolves.toBe(false);
  });

  it('fails open on HTTP errors and network failures', async () => {
    await expect(isPasswordBreached('password', respond('', false) as unknown as typeof fetch)).resolves.toBe(false);
    const failing = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(isPasswordBreached('password', failing as unknown as typeof fetch)).resolves.toBe(false);
  });
});

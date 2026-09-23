import { describe, it, expect } from 'vitest';
import { getErrorMessage } from './notificationService';

describe('getErrorMessage', () => {
  it('maps auth errors to friendly text', () => {
    expect(getErrorMessage(new Error('Invalid login credentials'))).toMatch(/Incorrect email or password/);
    expect(getErrorMessage({ message: 'Email not confirmed' })).toMatch(/verify your email/);
  });

  it('recognises missing credits from the Edge Function', () => {
    expect(getErrorMessage(new Error('Insufficient credits'))).toMatch(/enough credits/);
  });

  it('recognises permission and network errors', () => {
    expect(getErrorMessage({ message: 'new row violates row-level security policy' })).toMatch(/permission/);
    expect(getErrorMessage(new TypeError('Failed to fetch'))).toMatch(/Network error/);
  });

  it('falls back to the given default, or to the raw message when none is given', () => {
    expect(getErrorMessage(null, 'Custom')).toBe('Custom');
    expect(getErrorMessage(new Error('weird failure'), 'Could not save')).toBe('Could not save');
    expect(getErrorMessage(new Error('weird failure'))).toBe('weird failure');
  });
});

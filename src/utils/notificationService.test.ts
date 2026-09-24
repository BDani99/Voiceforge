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

  it('recognises the rate limit and suspension answers of the Edge Function', () => {
    expect(getErrorMessage(new Error('Too many requests, please slow down'))).toMatch(/too fast/);
    expect(getErrorMessage(new Error('Account suspended'))).toBe('Your account has been suspended.');
  });

  it('recognises duplicate records and expired sessions', () => {
    expect(getErrorMessage({ code: '23505', message: 'duplicate key' })).toBe('This record already exists.');
    expect(getErrorMessage(new Error('JWT expired'))).toMatch(/session has expired/);
  });

  it('describes anything that can be thrown', () => {
    expect(getErrorMessage('Invalid login credentials')).toMatch(/Incorrect email or password/);
    expect(getErrorMessage({ error_description: 'invalid_grant' })).toMatch(/Incorrect email or password/);
    expect(getErrorMessage({ code: 42 }, 'Fallback')).toBe('Fallback');
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

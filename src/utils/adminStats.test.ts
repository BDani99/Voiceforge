import { describe, it, expect } from 'vitest';
import { parseDashboardStats } from './adminStats';

const valid = {
  total_users: 3,
  api_calls: 24,
  cached_files: 21,
  daily_active: 1,
  daily_characters: [{ day: '2026-09-23', characters: 120 }],
  languages: [{ language: 'en-US', characters: 120 }],
};

describe('parseDashboardStats', () => {
  it('maps the SQL result to the camelCase model', () => {
    expect(parseDashboardStats(valid)).toEqual({
      totalUsers: 3,
      apiCalls: 24,
      cachedFiles: 21,
      dailyActive: 1,
      dailyCharacters: [{ day: '2026-09-23', characters: 120 }],
      languages: [{ language: 'en-US', characters: 120 }],
    });
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a missing counter', { ...valid, total_users: undefined }],
    ['a non-numeric counter', { ...valid, api_calls: '24' }],
    ['malformed rows', { ...valid, daily_characters: [1, 2] }],
    ['a row without a day', { ...valid, daily_characters: [{ characters: 1 }] }],
  ])('rejects %s', (_name, value) => {
    expect(() => parseDashboardStats(value as never)).toThrow(/Invalid dashboard stats/);
  });
});

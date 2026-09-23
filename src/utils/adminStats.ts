import type { Json } from '../types/database';

export interface DashboardStats {
  totalUsers: number;
  apiCalls: number;
  cachedFiles: number;
  dailyActive: number;
  dailyCharacters: { day: string; characters: number }[];
  languages: { language: string; characters: number }[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asNumber = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Invalid dashboard stats: ${field}`);
  return value;
};

const asRows = (value: unknown, field: string): Record<string, unknown>[] => {
  if (!Array.isArray(value) || !value.every(isRecord)) throw new Error(`Invalid dashboard stats: ${field}`);
  return value;
};

/** Validates the JSON returned by the admin_dashboard_stats SQL function. */
export function parseDashboardStats(value: Json | null): DashboardStats {
  if (!isRecord(value)) throw new Error('Invalid dashboard stats');

  return {
    totalUsers: asNumber(value.total_users, 'total_users'),
    apiCalls: asNumber(value.api_calls, 'api_calls'),
    cachedFiles: asNumber(value.cached_files, 'cached_files'),
    dailyActive: asNumber(value.daily_active, 'daily_active'),
    dailyCharacters: asRows(value.daily_characters, 'daily_characters').map((row) => {
      if (typeof row.day !== 'string') throw new Error('Invalid dashboard stats: day');
      return { day: row.day, characters: asNumber(row.characters, 'characters') };
    }),
    languages: asRows(value.languages, 'languages').map((row) => {
      if (typeof row.language !== 'string') throw new Error('Invalid dashboard stats: language');
      return { language: row.language, characters: asNumber(row.characters, 'characters') };
    }),
  };
}

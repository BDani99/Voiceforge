import { describe, it, expect } from 'vitest';
import { buildDailyUsage, computeUsageStats, type UsageLogEntry } from './usageStats';

const now = new Date(2026, 8, 23, 12, 0, 0); // local time, 23 Sep 2026
const at = (day: number) => new Date(2026, 8, day, 9, 30).toISOString();

const logs: UsageLogEntry[] = [
  { action_type: 'generation', character_count: 100, created_at: at(23) },
  { action_type: 'preview', character_count: 20, created_at: at(23) },
  { action_type: 'generation', character_count: 50, created_at: at(21) },
  { action_type: 'admin_topup', character_count: 5000, created_at: at(23) },
  { action_type: 'generation', character_count: 999, created_at: at(1) }, // outside the window
  { action_type: 'generation', character_count: 7, created_at: null },
];

describe('buildDailyUsage', () => {
  it('returns one bucket per day, oldest first, ending today', () => {
    const daily = buildDailyUsage(logs, 14, now);
    expect(daily).toHaveLength(14);
    expect(daily[13]).toEqual({ date: 'Sep 23', chars: 120 });
    expect(daily[11]).toEqual({ date: 'Sep 21', chars: 50 });
    expect(daily[0]?.date).toBe('Sep 10');
  });

  it('ignores admin credit changes, old logs and logs without a date', () => {
    const total = buildDailyUsage(logs, 14, now).reduce((sum, d) => sum + d.chars, 0);
    expect(total).toBe(170);
  });
});

describe('computeUsageStats', () => {
  it('counts generations and averages over active days', () => {
    const daily = buildDailyUsage(logs, 14, now);
    expect(computeUsageStats(logs, daily)).toEqual({ totalGenerated: 5, totalUsed: 1176, avgPerDay: 588 });
  });

  it('handles no usage', () => {
    expect(computeUsageStats([], buildDailyUsage([], 14, now))).toEqual({ totalGenerated: 0, totalUsed: 0, avgPerDay: 0 });
  });
});

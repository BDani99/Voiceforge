export interface UsageLogEntry {
  action_type: string;
  character_count: number;
  created_at: string | null;
}

export interface DailyUsage {
  date: string;
  chars: number;
}

export interface UsageStats {
  totalGenerated: number;
  totalUsed: number;
  avgPerDay: number;
}

const GENERATION_ACTIONS = new Set(['generation', 'preview']);

const dayLabel = (date: Date): string => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** Only actual speech generation counts as usage, credit adjustments by admins do not. */
export const isGenerationLog = (log: UsageLogEntry): boolean => GENERATION_ACTIONS.has(log.action_type);

/** Characters used per day for the last `days` days (oldest first, days without usage are 0). */
export function buildDailyUsage(logs: UsageLogEntry[], days = 14, now: Date = new Date()): DailyUsage[] {
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    buckets.set(dayLabel(d), 0);
  }

  for (const log of logs) {
    if (!isGenerationLog(log) || !log.created_at) continue;
    const key = dayLabel(new Date(log.created_at));
    const current = buckets.get(key);
    if (current !== undefined) buckets.set(key, current + log.character_count);
  }

  return [...buckets].map(([date, chars]) => ({ date, chars }));
}

export function computeUsageStats(logs: UsageLogEntry[], daily: DailyUsage[]): UsageStats {
  const generationLogs = logs.filter(isGenerationLog);
  const totalUsed = generationLogs.reduce((sum, l) => sum + l.character_count, 0);
  const activeDays = daily.filter((d) => d.chars > 0).length;

  return {
    totalGenerated: generationLogs.length,
    totalUsed,
    avgPerDay: activeDays > 0 ? Math.round(totalUsed / activeDays) : 0,
  };
}

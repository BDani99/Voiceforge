import type { Database } from './database';

/** Row type of a public table, e.g. `Tables<'projects'>`. */
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];

/** Insert payload type of a public table. */
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];

import { createContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';

export interface Profile {
  id: string;
  role: string | null;
  is_banned: boolean | null;
  display_name: string | null;
}

export interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  /** True until the session and the profile of the signed-in user are known. */
  loading: boolean;
  user: User | null;
  isAdmin: boolean;
  isBanned: boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

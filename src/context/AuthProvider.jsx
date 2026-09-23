import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabase';
import { AuthContext } from './authContext';

async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from('users_profile')
    .select('id, role, is_banned, display_name')
    .eq('id', userId)
    .maybeSingle();
  if (error) console.error('Failed to load profile:', error);
  return data ?? null;
}

/**
 * Loads the session and profile once and shares them with the whole app, so
 * route guards do not each hit the database on every navigation.
 */
export function AuthProvider({ children }) {
  const [state, setState] = useState({ session: null, profile: null, loading: true });

  useEffect(() => {
    let active = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Keep guards in a loading state until the profile of a new session is known,
      // otherwise they would briefly see "signed in but no session" and redirect to login.
      if (session?.user && event !== 'TOKEN_REFRESHED') {
        setState((prev) => ({ ...prev, session, loading: true }));
      }

      // Supabase calls listeners while holding an internal lock; issuing further
      // requests from inside can deadlock, so the profile is loaded after the callback.
      setTimeout(async () => {
        if (!active) return;

        if (!session?.user) {
          setState({ session: null, profile: null, loading: false });
        } else if (event === 'TOKEN_REFRESHED') {
          setState((prev) => ({ ...prev, session }));
        } else {
          const profile = await fetchProfile(session.user.id);
          if (active) setState({ session, profile, loading: false });
        }
      }, 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const isBanned = !!state.profile?.is_banned;

  useEffect(() => {
    if (isBanned) supabase.auth.signOut();
  }, [isBanned]);

  const value = useMemo(() => ({
    ...state,
    user: state.session?.user ?? null,
    isAdmin: state.profile?.role === 'admin',
    isBanned,
  }), [state, isBanned]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

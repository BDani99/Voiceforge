import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from '../context/authContext';

/** Current session, profile and derived flags. Must be used below <AuthProvider>. */
export const useAuth = (): AuthContextValue => {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within an AuthProvider');
  return value;
};

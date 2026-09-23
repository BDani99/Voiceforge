import { useState, type FormEvent } from 'react';
import { supabase } from '../../services/supabase';
import { useNavigate } from 'react-router-dom';
import { notify, getErrorMessage } from '../../utils/notificationService';
import { Shield } from 'lucide-react';
import '../Auth/Auth.css';

export default function AdminAuth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const navigate = useNavigate();

  const handleAdminLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      
      // Verify admin role
      const { data: profile } = await supabase.from('users_profile').select('role').eq('id', data.user.id).maybeSingle();

      if (profile?.role !== 'admin') {
        // Not an admin, sign out immediately
        await supabase.auth.signOut();
        throw new Error("You don't have permission to access the admin area.");
      }
      
      notify.success('Admin login successful');
      void navigate('/admin/dashboard');
    } catch (error) {
      const friendlyMessage = getErrorMessage(error);
      setErrorMsg(friendlyMessage);
      notify.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container admin-auth">
      <div className="auth-card">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
          <Shield size={48} color="#c084fc" />
        </div>
        <h1>VoiceForge Admin</h1>
        <h2>Restricted Access</h2>
        <form onSubmit={handleAdminLogin}>
          <input aria-label="Admin Email" autoComplete="username"
            type="email"
            placeholder="Admin Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input aria-label="Password" autoComplete="current-password"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {errorMsg && <div className="auth-error">{errorMsg}</div>}
          <button type="submit" disabled={loading} style={{ background: '#c084fc' }}>
            {loading ? 'Authenticating...' : 'Secure Login'}
          </button>
        </form>
      </div>
    </div>
  );
}

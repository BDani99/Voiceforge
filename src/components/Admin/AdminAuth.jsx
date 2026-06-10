import React, { useState } from 'react';
import { supabase } from '../../services/supabase';
import { useNavigate } from 'react-router-dom';
import { notify, getErrorMessage } from '../../utils/notificationService';
import { Shield } from 'lucide-react';
import './Admin.css';

export default function AdminAuth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const navigate = useNavigate();

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      
      // Verify admin role
      const { data: profile } = await supabase.from('users_profile').select('role').eq('id', data.user.id).single();

      if (profile?.role !== 'admin' && data.user.email !== 'admin@voiceforge.com') {
        // Not an admin, sign out immediately
        await supabase.auth.signOut();
        throw new Error("You don't have permission to access the admin area.");
      }
      
      notify.success('Admin login successful');
      navigate('/admin/dashboard');
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
          <input
            type="email"
            placeholder="Admin Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" disabled={loading} style={{ background: '#c084fc' }}>
            {loading ? 'Authenticating...' : 'Secure Login'}
          </button>
        </form>
      </div>
    </div>
  );
}

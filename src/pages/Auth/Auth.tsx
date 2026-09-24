import { useState, type FormEvent } from 'react';
import { supabase } from '../../services/supabase';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { notify, getErrorMessage } from '../../utils/notificationService';
import { isPasswordBreached, validatePassword } from '../../utils/passwordPolicy';
import PasswordStrengthMeter from '../../components/PasswordStrengthMeter/PasswordStrengthMeter';
import { Eye, EyeOff } from 'lucide-react';
import './Auth.css';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();


  const handleAuth = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        void navigate('/projects');
      } else {
        if (password !== confirmPassword) throw new Error('Passwords do not match.');
        const policyError = validatePassword(password);
        if (policyError) throw new Error(policyError);
        if (await isPasswordBreached(password)) {
          throw new Error('This password appeared in a known data breach. Please choose a different one.');
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: displayName } },
        });
        if (error) throw error;
        // With e-mail confirmation on, an address that is already registered comes back without identities.
        if (data.user?.identities?.length === 0) throw new Error('User already registered');

        if (data.session) {
          notify.success('Account created. Welcome to VoiceForge!'); // the route guard forwards to the app
        } else {
          notify.success('Registration successful! Check your e-mail to confirm your account, then log in.');
          setIsLogin(true);
        }
      }
    } catch (error) {
      const friendlyMessage = getErrorMessage(error);
      setErrorMsg(friendlyMessage);
      notify.error(error);
      setShake(true);
      setTimeout(() => setShake(false), 400);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleMode = () => {
    setIsLogin(!isLogin);
    setErrorMsg('');
    setPassword('');
    setConfirmPassword('');
    setDisplayName('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  if (!authLoading && session) return <Navigate to="/projects" replace />;

  return (
    <div className="auth-container">
      <div className={`auth-card ${shake ? 'shake' : ''}`}>
        <h1>VoiceForge</h1>
        <h2>{isLogin ? 'Login' : 'Register'}</h2>
        <form onSubmit={handleAuth}>
          <input aria-label="Email" autoComplete="email"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          {!isLogin && (
            <input aria-label="Display Name" autoComplete="nickname"
              type="text"
              placeholder="Display Name (Optional)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          )}

          <div className="password-input-wrapper">
            <input aria-label="Password" autoComplete={isLogin ? 'current-password' : 'new-password'}
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="eye-toggle-btn"
              onClick={() => setShowPassword(v => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {!isLogin && <PasswordStrengthMeter password={password} />}

          {!isLogin && (
            <div className="password-input-wrapper">
              <input aria-label="Confirm Password" autoComplete="new-password"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="eye-toggle-btn"
                onClick={() => setShowConfirmPassword(v => !v)}
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          )}

          {errorMsg && <div className="auth-error">{errorMsg}</div>}
          <button type="submit" disabled={loading}>
            {loading ? 'Processing...' : (isLogin ? 'Login' : 'Register')}
          </button>
        </form>
        <p onClick={handleToggleMode} className="toggle-auth">
          {isLogin ? "Don't have an account? Register" : 'Already have an account? Login'}
        </p>
      </div>
    </div>
  );
}

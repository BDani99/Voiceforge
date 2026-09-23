import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { useNavigate } from 'react-router-dom';
import { notify, getErrorMessage } from '../../utils/notificationService';
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
  const [strength, setStrength] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (isLogin) return;
    let s = 0;
    if (password.length > 5) s += 1;
    if (password.length > 8) s += 1;
    if (/[A-Z]/.test(password)) s += 1;
    if (/[0-9!@#$%^&*]/.test(password)) s += 1;
    setStrength(s);
  }, [password, isLogin]);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate('/projects');
      } else {
        if (password !== confirmPassword) throw new Error('Passwords do not match.');
        if (strength < 2) throw new Error('Password is too weak.');
        const { error } = await supabase.auth.signUp({ 
          email, 
          password,
          options: {
            data: { display_name: displayName }
          }
        });
        if (error) throw error;
        notify.success('Registration successful! You can now log in.');
        setIsLogin(true);
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

  const renderStrengthMeter = () => {
    if (isLogin || password.length === 0) return null;
    return (
      <div className="password-strength-meter">
        {[1, 2, 3, 4].map(level => {
          let className = 'strength-bar';
          if (strength >= level) {
            if (strength <= 1) className += ' strength-weak';
            else if (strength === 2) className += ' strength-medium';
            else className += ' strength-strong';
          }
          return <div key={level} className={className}></div>;
        })}
      </div>
    );
  };

  return (
    <div className="auth-container">
      <div className={`auth-card ${shake ? 'shake' : ''}`}>
        <h1>VoiceForge</h1>
        <h2>{isLogin ? 'Login' : 'Register'}</h2>
        <form onSubmit={handleAuth}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          {!isLogin && (
            <input
              type="text"
              placeholder="Display Name (Optional)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          )}

          <div className="password-input-wrapper">
            <input
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
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {renderStrengthMeter()}

          {!isLogin && (
            <div className="password-input-wrapper">
              <input
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

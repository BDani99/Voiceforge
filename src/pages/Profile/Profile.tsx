import { useState, useEffect, useCallback, type FormEvent } from 'react';
import type { User as AuthUser } from '@supabase/supabase-js';
import { supabase } from '../../services/supabase';
import { useNavigate } from 'react-router-dom';
import { notify } from '../../utils/notificationService';
import { buildDailyUsage, computeUsageStats, type DailyUsage, type UsageStats } from '../../utils/usageStats';
import { isPasswordBreached, validatePassword } from '../../utils/passwordPolicy';
import type { Tables } from '../../types/aliases';
import {
  User, ArrowLeft, Settings, Activity, Zap, TrendingUp,
  TrendingDown, Eye, EyeOff, Save, Key, Mail, Calendar,
  BarChart3, Clock, FileText, Shield, AlertTriangle, Coins, LogOut
} from 'lucide-react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area
} from 'recharts';
import LoadingScreen from '../../components/LoadingScreen/LoadingScreen';
import PasswordStrengthMeter from '../../components/PasswordStrengthMeter/PasswordStrengthMeter';
import ConfirmModal from '../../components/ConfirmModal/ConfirmModal';
import { useConfirm } from '../../hooks/useConfirm';
import './Profile.css';

type ProfileRow = Tables<'users_profile'>;
type UsageLog = Pick<Tables<'usage_logs'>, 'id' | 'action_type' | 'character_count' | 'created_at' | 'reason' | 'language' | 'project_id'>;
type LogWithProject = UsageLog & { projectTitle: string | null };

const ACTION_LABELS: Record<string, string> = {
  generation: 'Generation',
  preview: 'Preview',
  admin_topup: 'Credit Top-up',
  admin_deduct: 'Credit Deduction',
};

export default function Profile() {
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();
  const [activeTab, setActiveTab] = useState<'usage' | 'settings'>('usage');
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [logs, setLogs] = useState<LogWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<DailyUsage[]>([]);
  const [stats, setStats] = useState<UsageStats & { projectCount: number }>({ totalGenerated: 0, totalUsed: 0, projectCount: 0, avgPerDay: 0 });
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    void navigate('/login');
  };

  // Settings state
  const [displayName, setDisplayName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { void void navigate('/login'); return; }
      setUser(authUser);

      const [profileRes, logsRes, projectsRes] = await Promise.all([
        supabase.from('users_profile').select('*').eq('id', authUser.id).single(),
        supabase.from('usage_logs')
          .select('id, action_type, character_count, created_at, reason, language, project_id')
          .eq('user_id', authUser.id)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase.from('projects').select('id', { count: 'exact', head: true }).eq('user_id', authUser.id).eq('is_deleted', false)
      ]);

      if (profileRes.data) {
        setProfile(profileRes.data);
        setDisplayName(profileRes.data.display_name || '');
      }

      const logsData = logsRes.data ?? [];

      // Fetch project titles for logs that have a project_id
      const projectIds = [...new Set(logsData.flatMap((l) => (l.project_id ? [l.project_id] : [])))];
      const projectTitles = new Map<string, string>();
      if (projectIds.length > 0) {
        const { data: projData } = await supabase.from('projects').select('id, title').in('id', projectIds);
        projData?.forEach((p) => projectTitles.set(p.id, p.title));
      }
      setLogs(logsData.map((l) => ({ ...l, projectTitle: (l.project_id && projectTitles.get(l.project_id)) || null })));

      const daily = buildDailyUsage(logsData, 14);
      setChartData(daily);
      setStats({ ...computeUsageStats(logsData, daily), projectCount: projectsRes.count ?? 0 });

    } catch (err) {
      console.error(err);
      notify.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const handleSaveName = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !displayName.trim()) return;
    setSavingName(true);
    try {
      const { error } = await supabase
        .from('users_profile')
        .update({ display_name: displayName.trim() })
        .eq('id', user.id);
      if (error) throw error;
      setProfile(prev => (prev ? { ...prev, display_name: displayName.trim() } : prev));
      notify.success('Display name updated!');
    } catch (err) {
      notify.error(err, 'Failed to update name');
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      notify.error('Passwords do not match!');
      return;
    }
    const policyError = validatePassword(newPassword);
    if (policyError) {
      notify.error(policyError);
      return;
    }
    setSavingPassword(true);
    try {
      if (await isPasswordBreached(newPassword)) {
        notify.error('This password appeared in a known data breach. Please choose a different one.');
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      notify.success('Password changed successfully!');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      notify.error(err, 'Failed to change password');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmed = await confirm({
      title: 'Delete Account',
      message: 'Are you absolutely sure? This action cannot be undone and all your data will be permanently deleted.',
      confirmLabel: 'Delete Account',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!confirmed) return;
    
    try {
      const { error } = await supabase.rpc('delete_user');
      if (error) throw error;
      await supabase.auth.signOut();
      notify.success('Your account has been deleted.');
      void navigate('/login');
    } catch (err) {
      notify.error(err, 'Failed to delete account');
    }
  };

  const formatDate = (d: string | null) => (d ? new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : '—');

  const getActionLabel = (type: string) => ACTION_LABELS[type] ?? type;

  const getActionClass = (type: string) => {
    if (type === 'admin_topup') return 'topup';
    if (type === 'admin_deduct') return 'deduct';
    if (type === 'preview') return 'preview';
    return 'generation';
  };

  if (loading) return <LoadingScreen text="Loading profile..." />;

  return (
    <div className="profile-page">
      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        details={confirmState.details}
        confirmLabel={confirmState.confirmLabel}
        cancelLabel={confirmState.cancelLabel}
        variant={confirmState.variant}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />

      {/* Header */}
      <header className="profile-topbar">
        <div className="profile-topbar-left">
          <button className="profile-back-btn" onClick={() => navigate('/projects')}>
            <ArrowLeft size={18} />
            <span>Back to Projects</span>
          </button>
          <div className="profile-title">
            <div className="profile-avatar">
              {(profile?.display_name || user?.email || 'U').charAt(0).toUpperCase()}
            </div>
            <div>
              <h1>{profile?.display_name || 'My Profile'}</h1>
              <p className="profile-email">{user?.email}</p>
            </div>
          </div>
        </div>
        <div className="profile-topbar-right">
          <div className="credit-display">
            <Coins size={16} className="credit-icon" />
            <span className="credit-amount">{profile?.available_characters?.toLocaleString() || '0'}</span>
            <span className="credit-label">credits</span>
          </div>
          <button onClick={handleLogout} className="logout-btn" title="Logout" aria-label="Logout">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="profile-tabs-container">
        <div className="profile-tabs">
          <button
            className={`profile-tab ${activeTab === 'usage' ? 'active' : ''}`}
            onClick={() => setActiveTab('usage')}
          >
            <BarChart3 size={18} />
            Usage & Stats
          </button>
          <button
            className={`profile-tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={18} />
            Settings
          </button>
        </div>
      </div>

      <div className="profile-content">

        {/* ── USAGE TAB ── */}
        {activeTab === 'usage' && (
          <div className="tab-content">
            {/* Stat cards */}
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon purple"><Zap size={22} /></div>
                <div>
                  <div className="stat-value">{profile?.available_characters?.toLocaleString()}</div>
                  <div className="stat-label">Available Credits</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon blue"><TrendingDown size={22} /></div>
                <div>
                  <div className="stat-value">{stats.totalUsed.toLocaleString()}</div>
                  <div className="stat-label">Total Characters Used</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon green"><Activity size={22} /></div>
                <div>
                  <div className="stat-value">{stats.totalGenerated}</div>
                  <div className="stat-label">Generations Made</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon orange"><FileText size={22} /></div>
                <div>
                  <div className="stat-value">{stats.projectCount}</div>
                  <div className="stat-label">Active Projects</div>
                </div>
              </div>
            </div>

            {/* Chart */}
            <div className="chart-card">
              <h3><TrendingUp size={18} /> Character Usage – Last 14 Days</h3>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <defs>
                    <linearGradient id="charGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                    labelStyle={{ color: '#f8fafc' }}
                    itemStyle={{ color: '#c084fc' }}
                  />
                  <Area type="monotone" dataKey="chars" stroke="#8b5cf6" fill="url(#charGrad)" strokeWidth={2} dot={false} name="Characters" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Log table */}
            <div className="log-card">
              <h3><Clock size={18} /> Activity Log</h3>
              <div className="log-table-wrapper">
                <table className="log-table">
                  <thead>
                    <tr>
                      <th>Date & Time</th>
                      <th>Action</th>
                      <th>Project</th>
                      <th>Language</th>
                      <th>Credits</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.length === 0 ? (
                      <tr><td colSpan={6} className="log-empty">No activity yet.</td></tr>
                    ) : (
                      logs.map(log => (
                        <tr key={log.id}>
                          <td className="log-date">{formatDate(log.created_at)}</td>
                          <td><span className={`log-badge ${getActionClass(log.action_type)}`}>{getActionLabel(log.action_type)}</span></td>
                          <td className="log-project">{log.projectTitle || '—'}</td>
                          <td className="log-lang">{log.language || '—'}</td>
                          <td className={log.action_type === 'admin_topup' ? 'log-credit-pos' : 'log-credit-neg'}>
                            {log.action_type === 'admin_topup' ? '+' : '-'}{(log.character_count || 0).toLocaleString()}
                          </td>
                          <td className="log-reason">{log.reason || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {activeTab === 'settings' && (
          <div className="tab-content settings-tab">

            {/* Account Info */}
            <div className="settings-section">
              <div className="settings-section-header">
                <User size={20} />
                <div>
                  <h3>Account Information</h3>
                  <p>Your basic account details</p>
                </div>
              </div>
              <div className="settings-body">
                <div className="info-row">
                  <Mail size={16} />
                  <div style={{ flex: 1 }}>
                    <label>Email Address</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span>{user?.email}</span>
                    </div>
                  </div>
                </div>
                <div className="info-row">
                  <Calendar size={16} />
                  <div>
                    <label>Member Since</label>
                    <span>{profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}</span>
                  </div>
                </div>
                <div className="info-row">
                  <Shield size={16} />
                  <div>
                    <label>Account Role</label>
                    <span className="role-badge">{profile?.role || 'user'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Display Name */}
            <div className="settings-section">
              <div className="settings-section-header">
                <User size={20} />
                <div>
                  <h3>Display Name</h3>
                  <p>How you appear in the app</p>
                </div>
              </div>
              <form className="settings-body" onSubmit={handleSaveName}>
                <div className="form-group">
                  <label>Display Name</label>
                  <input aria-label="Enter your display name"
                    type="text"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="Enter your display name"
                    maxLength={50}
                  />
                </div>
                <button type="submit" className="btn-save" disabled={savingName || !displayName.trim()}>
                  <Save size={16} />
                  {savingName ? 'Saving...' : 'Save Name'}
                </button>
              </form>
            </div>

            {/* Change Password */}
            <div className="settings-section">
              <div className="settings-section-header">
                <Key size={20} />
                <div>
                  <h3>Change Password</h3>
                  <p>Use a strong password with at least 8 characters</p>
                </div>
              </div>
              <form className="settings-body" onSubmit={handleChangePassword}>
                <div className="form-group">
                  <label>New Password</label>
                  <div className="input-with-icon">
                    <input aria-label="New password" autoComplete="new-password"
                      type={showNewPw ? 'text' : 'password'}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                    />
                    <button type="button" className="pw-toggle" onClick={() => setShowNewPw(!showNewPw)} aria-label={showNewPw ? 'Hide password' : 'Show password'}>
                      {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label>Confirm New Password</label>
                  <div className="input-with-icon">
                    <input aria-label="Confirm new password" autoComplete="new-password"
                      type={showConfirmPw ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                    />
                    <button type="button" className="pw-toggle" onClick={() => setShowConfirmPw(!showConfirmPw)} aria-label={showConfirmPw ? 'Hide password' : 'Show password'}>
                      {showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                {newPassword && confirmPassword && newPassword !== confirmPassword && (
                  <div className="password-mismatch">
                    <AlertTriangle size={14} /> Passwords do not match
                  </div>
                )}
                <PasswordStrengthMeter password={newPassword} />
                <button
                  type="submit"
                  className="btn-save"
                  disabled={savingPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword}
                >
                  <Key size={16} />
                  {savingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </form>
            </div>

            {/* Danger zone */}
            <div className="settings-section danger-zone">
              <div className="settings-section-header">
                <AlertTriangle size={20} className="danger-icon" />
                <div>
                  <h3>Danger Zone</h3>
                  <p>Irreversible and destructive actions</p>
                </div>
              </div>
              <div className="settings-body">
                <div className="danger-action">
                  <div>
                    <strong>Delete Account</strong>
                    <p>Permanently delete your account and all data. This cannot be undone.</p>
                  </div>
                  <button className="btn-danger" onClick={handleDeleteAccount}>
                    Delete Account
                  </button>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

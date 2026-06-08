import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
  User, ArrowLeft, Settings, Activity, Zap, TrendingUp,
  TrendingDown, Eye, EyeOff, Save, Key, Mail, Calendar,
  BarChart3, Clock, FileText, Shield, AlertTriangle, Coins, LogOut
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area
} from 'recharts';
import LoadingScreen from '../LoadingScreen/LoadingScreen';
import './Profile.css';

export default function Profile() {
  const [activeTab, setActiveTab] = useState('usage');
  const [profile, setProfile] = useState(null);
  const [user, setUser] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState([]);
  const [stats, setStats] = useState({ totalGenerated: 0, totalUsed: 0, projectCount: 0, avgPerDay: 0 });
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  // Settings state
  const [displayName, setDisplayName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { navigate('/login'); return; }
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

      const logsData = logsRes.data || [];

      // Fetch project titles for logs that have a project_id
      const projectIds = [...new Set(logsData.filter(l => l.project_id).map(l => l.project_id))];
      let projectMap = {};
      if (projectIds.length > 0) {
        const { data: projData } = await supabase.from('projects').select('id, title').in('id', projectIds);
        if (projData) projData.forEach(p => { projectMap[p.id] = p.title; });
      }
      const enrichedLogs = logsData.map(l => ({ ...l, projectTitle: projectMap[l.project_id] || null }));
      setLogs(enrichedLogs);

      // Compute stats
      const generationLogs = logsData.filter(l => l.action_type === 'generation' || l.action_type === 'preview');
      const totalUsed = generationLogs.reduce((s, l) => s + (l.character_count || 0), 0);

      // Chart: last 14 days
      const days = {};
      for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        days[key] = 0;
      }
      generationLogs.forEach(l => {
        const key = new Date(l.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (days[key] !== undefined) days[key] += l.character_count || 0;
      });
      const chartArr = Object.entries(days).map(([date, chars]) => ({ date, chars }));
      setChartData(chartArr);

      const activeDays = chartArr.filter(d => d.chars > 0).length;
      setStats({
        totalGenerated: generationLogs.length,
        totalUsed,
        projectCount: projectsRes.count || 0,
        avgPerDay: activeDays > 0 ? Math.round(totalUsed / activeDays) : 0,
      });

    } catch (err) {
      console.error(err);
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveName = async (e) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setSavingName(true);
    try {
      const { error } = await supabase
        .from('users_profile')
        .update({ display_name: displayName.trim() })
        .eq('id', user.id);
      if (error) throw error;
      toast.success('Display name updated!');
    } catch (err) {
      toast.error('Failed to update name: ' + err.message);
    } finally {
      setSavingName(false);
    }
  };

  const handleSaveEmail = async (e) => {
    e.preventDefault();
    const newEmail = prompt('Enter your new email address:', user?.email);
    if (!newEmail || newEmail === user?.email) return;
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) throw error;
      toast.success('Check your new email to confirm the change!');
    } catch (err) {
      toast.error('Failed to update email: ' + err.message);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match!');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters!');
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error('Failed to change password: ' + err.message);
    } finally {
      setSavingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm('Are you absolutely sure? This action cannot be undone and all your data will be permanently deleted.')) return;
    toast.error('Account deletion must be done by an administrator. Please contact support.');
  };

  const formatDate = (d) => new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const getActionLabel = (type) => {
    const labels = { generation: 'Generation', preview: 'Preview', admin_topup: 'Credit Top-up', admin_deduct: 'Credit Deduction' };
    return labels[type] || type;
  };

  const getActionClass = (type) => {
    if (type === 'admin_topup') return 'topup';
    if (type === 'admin_deduct') return 'deduct';
    if (type === 'preview') return 'preview';
    return 'generation';
  };

  if (loading) return <LoadingScreen text="Loading profile..." />;

  return (
    <div className="profile-page">
      {/* Header */}
      <header className="profile-topbar">
        <div className="profile-topbar-left">
          <button className="profile-back-btn" onClick={() => navigate('/projects')}>
            <ArrowLeft size={18} />
            <span>Back to Projects</span>
          </button>
          <div className="profile-title">
            <div className="profile-avatar">
              {(profile?.display_name || user?.email || 'U')[0].toUpperCase()}
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
          <button className="profile-btn" onClick={() => navigate('/profile')}>
            <User size={18} />
            <span>{profile?.display_name || user?.email?.split('@')[0] || 'Profile'}</span>
          </button>
          <button onClick={handleLogout} className="logout-btn" title="Logout">
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
                      <tr><td colSpan="6" className="log-empty">No activity yet.</td></tr>
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
                  <div>
                    <label>Email Address</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span>{user?.email}</span>
                      <button onClick={handleSaveEmail} className="change-email-btn" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#c084fc', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}>Change</button>
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
                  <input
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
                    <input
                      type={showNewPw ? 'text' : 'password'}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                    />
                    <button type="button" className="pw-toggle" onClick={() => setShowNewPw(!showNewPw)}>
                      {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label>Confirm New Password</label>
                  <div className="input-with-icon">
                    <input
                      type={showConfirmPw ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                    />
                    <button type="button" className="pw-toggle" onClick={() => setShowConfirmPw(!showConfirmPw)}>
                      {showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                {newPassword && confirmPassword && newPassword !== confirmPassword && (
                  <div className="password-mismatch">
                    <AlertTriangle size={14} /> Passwords do not match
                  </div>
                )}
                {newPassword.length > 0 && (
                  <div className="password-strength">
                    <div className={`strength-bar ${newPassword.length >= 8 ? newPassword.length >= 12 ? 'strong' : 'medium' : 'weak'}`}></div>
                    <span>{newPassword.length >= 12 ? 'Strong' : newPassword.length >= 8 ? 'Medium' : 'Too short'}</span>
                  </div>
                )}
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

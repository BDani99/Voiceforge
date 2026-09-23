import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { notify } from '../../utils/notificationService';
import { Users, Activity, Database, Zap, TrendingUp } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import LoadingScreen from '../../components/LoadingScreen/LoadingScreen';
import './AdminDashboard.css';

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    apiCalls: 0,
    cacheHits: 0,
    dailyActive: 0
  });
  const [chartData, setChartData] = useState([]);
  const [pieData, setPieData] = useState([]);
  const [loading, setLoading] = useState(true);

  const COLORS = ['#8B5CF6', '#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#14B8A6'];

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // All aggregation happens in the database (see the admin_dashboard_stats migration).
        const { data, error } = await supabase.rpc('admin_dashboard_stats', { days: 14 });
        if (error) throw error;
        if (cancelled) return;

        setStats({
          totalUsers: data.total_users,
          apiCalls: data.api_calls,
          cacheHits: data.cached_files,
          dailyActive: data.daily_active
        });

        // 'YYYY-MM-DD' is parsed as a local date so the label does not shift by timezone.
        setChartData(data.daily_characters.map(({ day, characters }) => ({
          name: new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          characters
        })));

        const languages = data.languages.map(({ language, characters }) => ({ name: language, value: characters }));
        setPieData(languages.length > 0 ? languages : [{ name: 'No data', value: 1 }]);
      } catch (err) {
        console.error(err);
        if (!cancelled) notify.error(err, 'Failed to load dashboard stats');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  if (loading) return <LoadingScreen text="Loading dashboard..." />;

  return (
    <div className="dashboard-container">
      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Total Users</span>
            <Users size={20} className="kpi-icon" />
          </div>
          <div className="kpi-value">{stats.totalUsers}</div>
          <div className="kpi-trend positive">
            <TrendingUp size={14} /> <span>Live data</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">API Generations</span>
            <Activity size={20} className="kpi-icon" />
          </div>
          <div className="kpi-value">{stats.apiCalls.toLocaleString()}</div>
          <div className="kpi-trend positive">
            <TrendingUp size={14} /> <span>Live data</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Cached Audio Files</span>
            <Database size={20} className="kpi-icon" />
          </div>
          <div className="kpi-value">{stats.cacheHits.toLocaleString()}</div>
          <div className="kpi-trend positive">
            <TrendingUp size={14} /> <span>Live data</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Daily Active Users</span>
            <Zap size={20} className="kpi-icon text-yellow-500" />
          </div>
          <div className="kpi-value">{stats.dailyActive}</div>
          <div className="kpi-trend positive">
            <TrendingUp size={14} /> <span>Last 24 hours</span>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="charts-grid">
        <div className="chart-card">
          <h3>Generated Characters (Last 14 Days)</h3>
          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="name" stroke="#94A3B8" fontSize={12} tickMargin={10} />
                <YAxis stroke="#94A3B8" fontSize={12} tickFormatter={(val) => val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val} />
                <RechartsTooltip
                  contentStyle={{ backgroundColor: '#1E293B', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f8fafc' }}
                  itemStyle={{ color: '#8B5CF6' }}
                />
                <Line type="monotone" dataKey="characters" stroke="#8B5CF6" strokeWidth={3} dot={{ fill: '#8B5CF6', strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card pie-card">
          <h3>Language Distribution</h3>
          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip
                  contentStyle={{ backgroundColor: '#1E293B', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

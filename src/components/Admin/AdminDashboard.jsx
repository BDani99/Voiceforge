import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { notify } from '../../utils/notificationService';
import { Users, Activity, Database, Zap, TrendingUp, TrendingDown, Info } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import LoadingScreen from '../LoadingScreen/LoadingScreen';
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
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const { count: userCount } = await supabase
        .from('users_profile')
        .select('*', { count: 'exact', head: true });

      const { count: apiCalls } = await supabase
        .from('usage_logs')
        .select('*', { count: 'exact', head: true })
        .in('action_type', ['generation', 'preview']);

      const { count: cacheEntries } = await supabase
        .from('audio_cache')
        .select('*', { count: 'exact', head: true });

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const { data: dauData } = await supabase
        .from('usage_logs')
        .select('user_id')
        .gte('created_at', yesterday.toISOString());
      const dauCount = dauData ? new Set(dauData.map(log => log.user_id)).size : 0;

      setStats({
        totalUsers: userCount || 0,
        apiCalls: apiCalls || 0,
        cacheHits: cacheEntries || 0,
        dailyActive: dauCount
      });

      // Fetch real log data for the last 14 days
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      const { data: recentLogs } = await supabase
        .from('usage_logs')
        .select('created_at, character_count, language')
        .in('action_type', ['generation', 'preview'])
        .gte('created_at', fourteenDaysAgo.toISOString());

      if (recentLogs) {
        // Initialize 14 days array with 0
        const dailyData = {};
        const langDataMap = {};

        for (let i = 13; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          dailyData[dateStr] = 0;
        }

        // Group logs by day and by language
        recentLogs.forEach(log => {
          const d = new Date(log.created_at);
          const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          if (dailyData[dateStr] !== undefined) {
            dailyData[dateStr] += log.character_count || 0;
          }

          if (log.language) {
            langDataMap[log.language] = (langDataMap[log.language] || 0) + (log.character_count || 0);
          }
        });

        const formattedChartData = Object.keys(dailyData).map(dateStr => ({
          name: dateStr,
          characters: dailyData[dateStr]
        }));

        const formattedPieData = Object.keys(langDataMap).map(lang => ({
          name: lang,
          value: langDataMap[lang]
        })).sort((a, b) => b.value - a.value).slice(0, 6); // Top 6 languages

        setChartData(formattedChartData);
        setPieData(formattedPieData.length > 0 ? formattedPieData : [{ name: 'No data', value: 1 }]);
      }
    } catch (err) {
      console.error(err);
      notify.error(err, 'Failed to load dashboard stats');
    } finally {
      setLoading(false);
    }
  };

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

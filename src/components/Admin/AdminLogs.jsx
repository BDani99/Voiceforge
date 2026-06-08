import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { toast } from 'react-hot-toast';
import { Search, Filter, ArrowUpRight, ArrowDownRight, Settings } from 'lucide-react';
import './AdminLogs.css';

export default function AdminLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  useEffect(() => {
    fetchLogs();
  }, [page]);

  const fetchLogs = async () => {
    setLoading(true);
    
    // We need to join with users_profile to get the email, but usage_logs only has user_id
    // Supabase supports joining if there's a foreign key. Let's try that.
    const { data, error } = await supabase
      .from('usage_logs')
      .select('*, users_profile(email)')
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      
    if (!error && data) {
      setLogs(data);
    } else {
      // Fallback if join fails (e.g. no FK setup properly)
      const { data: rawLogs } = await supabase
        .from('usage_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        
      if (rawLogs) setLogs(rawLogs);
      else toast.error('Error loading logs');
    }
    setLoading(false);
  };

  const getActionIcon = (action) => {
    switch (action) {
      case 'admin_topup': return <ArrowUpRight size={16} className="text-emerald-400" />;
      case 'admin_deduct': return <ArrowDownRight size={16} className="text-red-400" />;
      case 'generation': return <Settings size={16} className="text-purple-400" />;
      default: return null;
    }
  };

  const filteredLogs = logs.filter(log => {
    const term = searchTerm.toLowerCase();
    const email = log.users_profile?.email || log.user_id;
    return email.toLowerCase().includes(term) || 
           log.action_type.toLowerCase().includes(term) ||
           (log.reason && log.reason.toLowerCase().includes(term));
  });

  return (
    <div className="admin-logs-container">
      <div className="logs-header">
        <h2>System Log (Audit Trail)</h2>
        <p>Read-only view of transactions and generations.</p>
      </div>

      <div className="users-toolbar">
        <div className="search-box">
          <Search size={18} className="search-icon" />
          <input 
            type="text" 
            placeholder="Search by email, action, or reason..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="filter-btn">
          <Filter size={18} /> Filters
        </button>
      </div>

      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>User / Email</th>
              <th>Action Type</th>
              <th>Characters</th>
              <th>Reason / Parameters</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="5" style={{ textAlign: 'center' }}>Loading...</td></tr>
            ) : filteredLogs.map(log => (
              <tr key={log.id}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {new Date(log.created_at).toLocaleString()}
                </td>
                <td style={{ fontFamily: 'monospace' }}>
                  {log.users_profile?.email || log.user_id.substring(0,8) + '...'}
                </td>
                <td>
                  <div className="action-type-cell">
                    {getActionIcon(log.action_type)}
                    <span className={`badge-${log.action_type}`}>
                      {log.action_type}
                    </span>
                  </div>
                </td>
                <td style={{ fontWeight: 'bold' }}>
                  {log.action_type === 'admin_topup' ? '+' : log.action_type === 'admin_deduct' ? '-' : ''}
                  {log.character_count.toLocaleString()}
                </td>
                <td className="reason-cell">
                  {log.reason ? (
                    <span className="reason-text">{log.reason}</span>
                  ) : (
                    <span className="text-muted">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <button disabled={page === 0} onClick={() => setPage(page - 1)}>Newer</button>
        <span>Page: {page + 1}</span>
        <button onClick={() => setPage(page + 1)}>Older</button>
      </div>
    </div>
  );
}

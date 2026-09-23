import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../services/supabase';
import { notify } from '../../utils/notificationService';
import { Search, ArrowUpRight, ArrowDownRight, Settings, Volume2 } from 'lucide-react';
import type { Tables } from '../../types/aliases';
import './AdminLogs.css';

const PAGE_SIZE = 50;

type LogRow = Tables<'usage_logs'> & { users_profile: { email: string | null } | null };

export default function AdminLogs() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);

    // One extra row tells us whether there is an older page.
    const { data, error } = await supabase
      .from('usage_logs')
      .select('*, users_profile(email)')
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    if (error) {
      notify.error(error, 'Error loading logs');
    } else {
      setLogs(data.slice(0, PAGE_SIZE));
      setHasNextPage(data.length > PAGE_SIZE);
    }
    setLoading(false);
  }, [page]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'admin_topup': return <ArrowUpRight size={16} className="text-emerald-400" />;
      case 'admin_deduct': return <ArrowDownRight size={16} className="text-red-400" />;
      case 'generation': return <Settings size={16} className="text-purple-400" />;
      case 'preview': return <Volume2 size={16} className="text-purple-400" />;
      default: return null;
    }
  };

  const filteredLogs = logs.filter(log => {
    const term = searchTerm.toLowerCase();
    const email = log.users_profile?.email || log.user_id || '';
    return email.toLowerCase().includes(term) ||
           (log.action_type || '').toLowerCase().includes(term) ||
           (log.reason?.toLowerCase().includes(term) ?? false);
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
          <input aria-label="Search by email, action, or reason" 
            type="text" 
            placeholder="Search by email, action, or reason..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
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
              <tr><td colSpan={5} style={{ textAlign: 'center' }}>Loading...</td></tr>
            ) : filteredLogs.map(log => (
              <tr key={log.id}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {log.created_at ? new Date(log.created_at).toLocaleString() : '—'}
                </td>
                <td style={{ fontFamily: 'monospace' }}>
                  {log.users_profile?.email || `${(log.user_id || '').substring(0, 8)}...`}
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
                  {(log.character_count ?? 0).toLocaleString()}
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
        <button disabled={!hasNextPage} onClick={() => setPage(page + 1)}>Older</button>
      </div>
    </div>
  );
}

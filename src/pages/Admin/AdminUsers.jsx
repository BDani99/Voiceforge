import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../services/supabase';
import { notify } from '../../utils/notificationService';
import { Search, MoreVertical, X, ShieldAlert, Plus, Minus } from 'lucide-react';
import './AdminUsers.css';

const PAGE_SIZE = 20;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);

  // Modal State
  const [selectedUser, setSelectedUser] = useState(null);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditReason, setCreditReason] = useState('');
  const [creditAction, setCreditAction] = useState('add');

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from('users_profile')
      .select('*')
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE); // one extra row tells us if there is a next page

    if (UUID_RE.test(debouncedSearch)) {
      query = query.eq('id', debouncedSearch);
    } else if (debouncedSearch) {
      // Characters with a meaning in LIKE patterns are dropped instead of escaped.
      query = query.ilike('email', `%${debouncedSearch.replace(/[%_\\]/g, '')}%`);
    }

    const { data, error } = await query;
    if (error) {
      notify.error(error, 'Error loading users');
    } else {
      setUsers(data.slice(0, PAGE_SIZE));
      setHasNextPage(data.length > PAGE_SIZE);
    }
    setLoading(false);
  }, [page, debouncedSearch]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleAdjustCredits = async (e) => {
    e.preventDefault();
    if (!creditReason.trim()) {
      notify.warning('Reason is required!');
      return;
    }
    const amount = parseInt(creditAmount);
    if (isNaN(amount) || amount <= 0) {
      notify.warning('Enter a valid positive amount!');
      return;
    }

    const actualAmount = creditAction === 'add' ? amount : -amount;
    const newBalance = Math.max(0, selectedUser.available_characters + actualAmount);
    const appliedAmount = Math.abs(newBalance - selectedUser.available_characters);

    try {
      // Only update if the balance is still the one shown, so a generation running
      // at the same time cannot be overwritten by this transaction.
      const { data: updated, error } = await supabase
        .from('users_profile')
        .update({ available_characters: newBalance })
        .eq('id', selectedUser.id)
        .eq('available_characters', selectedUser.available_characters)
        .select('id');

      if (error) throw error;
      if (!updated || updated.length === 0) {
        notify.warning('The balance changed in the meantime. The list was refreshed, please try again.');
        closeModal();
        fetchUsers();
        return;
      }

      const { error: logError } = await supabase.from('usage_logs').insert([{
        user_id: selectedUser.id,
        character_count: appliedAmount,
        action_type: creditAction === 'add' ? 'admin_topup' : 'admin_deduct',
        reason: creditReason.trim()
      }]);
      if (logError) notify.warning('Credits were updated, but writing the audit log failed.');

      notify.success(`Credits updated for: ${selectedUser.email}`);
      setUsers(users.map(u => u.id === selectedUser.id ? { ...u, available_characters: newBalance } : u));
      closeModal();
    } catch (err) {
      console.error(err);
      notify.error(err, 'Error during transaction');
    }
  };

  const toggleBanStatus = async () => {
    const newStatus = !selectedUser.is_banned;
    try {
      const { error } = await supabase
        .from('users_profile')
        .update({ is_banned: newStatus })
        .eq('id', selectedUser.id);
        
      if (error) throw error;
      
      notify.success(newStatus ? 'Account suspended!' : 'Account activated!');
      setUsers(users.map(u => u.id === selectedUser.id ? { ...u, is_banned: newStatus } : u));
      setSelectedUser({ ...selectedUser, is_banned: newStatus });
    } catch (err) {
      notify.error(err, 'Error modifying status');
    }
  };

  const closeModal = () => {
    setSelectedUser(null);
    setCreditAmount('');
    setCreditReason('');
    setCreditAction('add');
  };

  return (
    <div className="admin-users-container">
      <div className="users-toolbar">
        <div className="search-box">
          <Search size={18} className="search-icon" />
          <input 
            type="text" 
            placeholder="Search by email or ID..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Email</th>
              <th>Registered</th>
              <th>Balance</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" style={{ textAlign: 'center' }}>Loading...</td></tr>
            ) : users.map(user => (
              <tr key={user.id} onClick={() => setSelectedUser(user)} style={{ cursor: 'pointer' }}>
                <td style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{user.id.substring(0, 8)}...</td>
                <td>{user.email || '—'}</td>
                <td>{new Date(user.created_at).toLocaleDateString()}</td>
                <td style={{ fontWeight: '600', color: '#c084fc' }}>{(user.available_characters ?? 0).toLocaleString()}</td>
                <td>
                  {user.is_banned ? (
                    <span className="admin-badge error">Suspended</span>
                  ) : (
                    <span className="admin-badge success">Active</span>
                  )}
                </td>
                <td>
                  <MoreVertical size={16} color="#94a3b8" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
        <span>Page: {page + 1}</span>
        <button disabled={!hasNextPage} onClick={() => setPage(page + 1)}>Next</button>
      </div>

      {/* User Details Modal */}
      {selectedUser && (
        <div className="admin-modal-overlay" onClick={closeModal}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>User Details</h3>
              <button onClick={closeModal} className="close-btn"><X size={20} /></button>
            </div>
            
            <div className="modal-body">
              <div className="user-info-grid">
                <div>
                  <label>Email</label>
                  <p>{selectedUser.email || '—'}</p>
                </div>
                <div>
                  <label>ID</label>
                  <p style={{ fontFamily: 'monospace' }}>{selectedUser.id}</p>
                </div>
                <div>
                  <label>Role</label>
                  <p className="role-text">{selectedUser.role}</p>
                </div>
                <div>
                  <label>Current Balance</label>
                  <p className="balance-text">{(selectedUser.available_characters ?? 0).toLocaleString()}</p>
                </div>
              </div>

              <div className="modal-section-divider" />

              <h4>Credit Transaction</h4>
              <form onSubmit={handleAdjustCredits} className="credit-form">
                <div className="credit-action-toggle">
                  <button 
                    type="button" 
                    className={creditAction === 'add' ? 'active add' : ''} 
                    onClick={() => setCreditAction('add')}
                  >
                    <Plus size={16} /> Add
                  </button>
                  <button 
                    type="button" 
                    className={creditAction === 'deduct' ? 'active deduct' : ''} 
                    onClick={() => setCreditAction('deduct')}
                  >
                    <Minus size={16} /> Deduct
                  </button>
                </div>
                
                <div className="form-group">
                  <label>Amount (Characters)</label>
                  <input 
                    type="number" 
                    value={creditAmount} 
                    onChange={e => setCreditAmount(e.target.value)} 
                    placeholder="e.g., 5000"
                    required
                    min="1"
                  />
                </div>
                
                <div className="form-group">
                  <label>Reason (Required for audit log)</label>
                  <input 
                    type="text" 
                    value={creditReason} 
                    onChange={e => setCreditReason(e.target.value)} 
                    placeholder="e.g., Compensation for error..."
                    required
                  />
                </div>
                
                <button type="submit" className="submit-credit-btn">
                  Execute Transaction
                </button>
              </form>

              <div className="modal-section-divider" />

              <div className="danger-zone">
                <h4>Danger Zone</h4>
                <button 
                  className={`ban-btn ${selectedUser.is_banned ? 'unban' : ''}`}
                  onClick={toggleBanStatus}
                >
                  <ShieldAlert size={18} />
                  {selectedUser.is_banned ? 'Unban Account' : 'Suspend Account'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

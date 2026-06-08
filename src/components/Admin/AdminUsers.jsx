import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { toast } from 'react-hot-toast';
import { Search, Filter, MoreVertical, X, ShieldAlert, Plus, Minus } from 'lucide-react';
import './AdminUsers.css';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  // Modal State
  const [selectedUser, setSelectedUser] = useState(null);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditReason, setCreditReason] = useState('');
  const [creditAction, setCreditAction] = useState('add');

  useEffect(() => {
    fetchUsers();
  }, [page]);

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('users_profile')
      .select('*')
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      
    if (!error && data) {
      setUsers(data);
    } else {
      toast.error('Error loading users');
    }
    setLoading(false);
  };

  const handleAdjustCredits = async (e) => {
    e.preventDefault();
    if (!creditReason.trim()) {
      toast.error('Reason is required!');
      return;
    }
    const amount = parseInt(creditAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Enter a valid positive amount!');
      return;
    }

    const actualAmount = creditAction === 'add' ? amount : -amount;
    const newBalance = Math.max(0, selectedUser.available_characters + actualAmount);

    try {
      const { error } = await supabase
        .from('users_profile')
        .update({ available_characters: newBalance })
        .eq('id', selectedUser.id);
        
      if (error) throw error;

      await supabase.from('usage_logs').insert([{
        user_id: selectedUser.id,
        character_count: amount,
        action_type: creditAction === 'add' ? 'admin_topup' : 'admin_deduct',
        reason: creditReason.trim()
      }]);

      toast.success(`Credits updated for: ${selectedUser.email}`);
      setUsers(users.map(u => u.id === selectedUser.id ? { ...u, available_characters: newBalance } : u));
      closeModal();
    } catch (err) {
      console.error(err);
      toast.error('Error during transaction');
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
      
      toast.success(newStatus ? 'Account suspended!' : 'Account activated!');
      setUsers(users.map(u => u.id === selectedUser.id ? { ...u, is_banned: newStatus } : u));
      setSelectedUser({ ...selectedUser, is_banned: newStatus });
    } catch (err) {
      toast.error('Error modifying status');
    }
  };

  const closeModal = () => {
    setSelectedUser(null);
    setCreditAmount('');
    setCreditReason('');
    setCreditAction('add');
  };

  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.id.includes(searchTerm)
  );

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
        <button className="filter-btn">
          <Filter size={18} /> Filters
        </button>
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
            ) : filteredUsers.map(user => (
              <tr key={user.id} onClick={() => setSelectedUser(user)} style={{ cursor: 'pointer' }}>
                <td style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{user.id.substring(0, 8)}...</td>
                <td>{user.email}</td>
                <td>{new Date(user.created_at).toLocaleDateString()}</td>
                <td style={{ fontWeight: '600', color: '#c084fc' }}>{user.available_characters.toLocaleString()}</td>
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
        <button onClick={() => setPage(page + 1)}>Next</button>
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
                  <p>{selectedUser.email}</p>
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
                  <p className="balance-text">{selectedUser.available_characters.toLocaleString()}</p>
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

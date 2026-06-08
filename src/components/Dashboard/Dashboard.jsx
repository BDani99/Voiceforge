import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../services/supabase';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Plus, Trash2, FolderOpen, Search, User, RefreshCcw, Sparkles, Zap, ArrowRight, ArchiveRestore, HardDrive, LayoutGrid, Clock } from 'lucide-react';
import LoadingScreen from '../LoadingScreen/LoadingScreen';
import Modal from '../Modal/Modal';
import ConfirmModal from '../ConfirmModal/ConfirmModal';
import { useConfirm } from '../../hooks/useConfirm';
import '../Header/Header.css';
import './Dashboard.css';

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('active'); // 'active' or 'trash'
  const [credits, setCredits] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const navigate = useNavigate();
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const [projectsResponse, profileResponse] = await Promise.all([
        supabase
          .from('projects')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('users_profile')
          .select('available_characters')
          .eq('id', user.id)
          .single()
      ]);

      if (projectsResponse.error) throw projectsResponse.error;
      if (profileResponse.error) throw profileResponse.error;

      setProjects(projectsResponse.data);
      setCredits(profileResponse.data.available_characters);
    } catch (error) {
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const createProject = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('projects')
        .insert([{ title: newTitle.trim(), user_id: user.id, is_deleted: false }])
        .select();

      if (error) throw error;
      setNewTitle('');
      setProjects([data[0], ...projects]);
      setIsCreateModalOpen(false);
      toast.success('Project created!');
      
      // Optionally redirect straight to project
      // navigate(`/app/${data[0].id}`);
    } catch (error) {
      toast.error('Failed to create project: ' + error.message);
    }
  };

  const softDeleteProject = async (id, e) => {
    e.stopPropagation();
    try {
      const { error } = await supabase.from('projects').update({ is_deleted: true }).eq('id', id);
      if (error) throw error;
      setProjects(projects.map(p => p.id === id ? { ...p, is_deleted: true } : p));
      toast.success('Project moved to trash');
    } catch (error) {
      toast.error('Failed to delete project');
    }
  };

  const restoreProject = async (id, e) => {
    e.stopPropagation();
    try {
      const { error } = await supabase.from('projects').update({ is_deleted: false }).eq('id', id);
      if (error) throw error;
      setProjects(projects.map(p => p.id === id ? { ...p, is_deleted: false } : p));
      toast.success('Project restored');
    } catch (error) {
      toast.error('Failed to restore project');
    }
  };

  const hardDeleteProject = async (id, e) => {
    e.stopPropagation();
    const confirmed = await confirm({
      title: 'Delete Project',
      message: 'Are you sure you want to permanently delete this project? This action cannot be undone.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      const { error } = await supabase.from('projects').delete().eq('id', id);
      if (error) throw error;
      setProjects(projects.filter(p => p.id !== id));
      toast.success('Project permanently deleted');
    } catch (error) {
      toast.error('Failed to delete project');
    }
  };

  const openProject = (id) => {
    navigate(`/app/${id}`);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const matchesSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTab = activeTab === 'trash' ? p.is_deleted : !p.is_deleted;
      return matchesSearch && matchesTab;
    });
  }, [projects, searchQuery, activeTab]);

  if (loading) return <LoadingScreen text="Loading projects..." />;

  const activeCount = projects.filter(p => !p.is_deleted).length;
  const trashCount = projects.filter(p => p.is_deleted).length;

  return (
    <div className="dashboard-container">
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

      {/* HEADER */}
      <header className="app-header dashboard-header">
        <div className="header-left">
          <div className="logo dashboard-logo">
            <div className="logo-icon-wrapper">
              <Sparkles size={24} />
            </div>
            <h1>VoiceForge</h1>
          </div>
        </div>
        <div className="header-right">
          <div className={`credit-display ${credits < 1000 ? 'low-credits pulse' : ''}`} title="Available Credits">
            <Zap size={18} className="credit-icon" />
            <span>{credits?.toLocaleString() || 0}</span>
            <span className="credit-label">credits</span>
          </div>
          <button className="profile-btn" onClick={() => navigate('/profile')} title="My Profile">
            <User size={20} />
          </button>
          <button className="logout-btn" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <div className="dashboard-content">
        <div className="dashboard-top-section">
          <div className="dashboard-hero">
            <p>Pick up where you left off or create a new audio project.</p>
          </div>

          <div className="search-box">
            <Search size={18} className="search-icon" />
            <input 
              type="text" 
              placeholder="Search your projects..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* TABS */}
        <div className="dashboard-tabs">
          <button 
            className={`tab-btn ${activeTab === 'active' ? 'active' : ''}`} 
            onClick={() => setActiveTab('active')}
          >
            <LayoutGrid size={18} />
            Active Projects
            <span className="tab-count">{activeCount}</span>
          </button>
          <button 
            className={`tab-btn ${activeTab === 'trash' ? 'active' : ''}`} 
            onClick={() => setActiveTab('trash')}
          >
            <Trash2 size={18} />
            Trash
            {trashCount > 0 && <span className="tab-count">{trashCount}</span>}
          </button>
        </div>

        {/* PROJECTS GRID */}
        <div className="projects-grid">
          
          {/* Create New Card (Only in Active Tab) */}
          {activeTab === 'active' && !searchQuery && (
            <div className="project-card create-new-card" onClick={() => setIsCreateModalOpen(true)}>
              <div className="create-new-icon">
                <Plus size={32} />
              </div>
              <h3>Create Project</h3>
              <p>Start a new audio generation</p>
            </div>
          )}

          {/* Project Cards */}
          {filteredProjects.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                {activeTab === 'trash' ? <Trash2 size={48} /> : <FolderOpen size={48} />}
              </div>
              <h3>{activeTab === 'trash' ? 'Trash is empty' : (searchQuery ? 'No results found' : 'No projects yet')}</h3>
              <p>{activeTab === 'trash' ? 'Deleted projects will appear here.' : 'Create your first project to get started.'}</p>
            </div>
          ) : (
            filteredProjects.map(project => (
              <div key={project.id} className={`project-card ${project.is_deleted ? 'deleted' : ''}`} onClick={() => !project.is_deleted && openProject(project.id)}>
                <div className="project-card-bg-effect"></div>
                <div className="project-info">
                  <div className="project-icon-wrapper">
                    <FolderOpen size={24} className="project-icon" />
                  </div>
                  <div className="project-details">
                    <h3>{project.title}</h3>
                    <div className="project-meta">
                      <Clock size={14} />
                      <span>{new Date(project.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                  </div>
                </div>

                <div className="project-actions">
                  {project.is_deleted ? (
                    <>
                      <button className="action-btn restore-btn" onClick={(e) => restoreProject(project.id, e)} title="Restore">
                        <ArchiveRestore size={18} />
                        <span>Restore</span>
                      </button>
                      <button className="action-btn hard-delete-btn" onClick={(e) => hardDeleteProject(project.id, e)} title="Permanently Delete">
                        <Trash2 size={18} />
                      </button>
                    </>
                  ) : (
                    <button className="action-btn delete-btn" onClick={(e) => softDeleteProject(project.id, e)} title="Move to Trash">
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>

                {!project.is_deleted && (
                  <div className="project-hover-arrow">
                    <ArrowRight size={20} />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* CREATE MODAL */}
      <Modal 
        isOpen={isCreateModalOpen} 
        onClose={() => {
          setIsCreateModalOpen(false);
          setNewTitle('');
        }} 
        title="Create New Project"
      >
        <form className="create-project-form" onSubmit={createProject}>
          <div className="form-group">
            <label>Project Title</label>
            <input
              type="text"
              placeholder="e.g. My Awesome Audiobook"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={() => setIsCreateModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn-submit" disabled={!newTitle.trim()}>
              <Plus size={18} />
              Create Project
            </button>
          </div>
        </form>
      </Modal>

    </div>
  );
}

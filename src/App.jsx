import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { supabase } from './services/supabase';
import Auth from './components/Auth/Auth';
import Workspace from './components/Workspace/Workspace';
import Dashboard from './components/Dashboard/Dashboard';
import Profile from './components/Profile/Profile';
import AdminDashboard from './components/Admin/AdminDashboard';
import AdminAuth from './components/Admin/AdminAuth';
import AdminLayout from './components/Admin/AdminLayout';
import AdminUsers from './components/Admin/AdminUsers';
import AdminLogs from './components/Admin/AdminLogs';
import AdminSettings from './components/Admin/AdminSettings';
import LoadingScreen from './components/LoadingScreen/LoadingScreen';
import SystemAnnouncement from './components/SystemAnnouncement/SystemAnnouncement';

function ProtectedRoute({ children, adminOnly = false }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSessionAndProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      if (session?.user) {
        const { data } = await supabase.from('users_profile').select('*').eq('id', session.user.id).single();
        setProfile(data);
      }
      setLoading(false);
    };

    fetchSessionAndProfile();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session?.user) {
        const { data } = await supabase.from('users_profile').select('*').eq('id', session.user.id).single();
        setProfile(data);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <LoadingScreen />;

  if (!session) {
    return <Navigate to={adminOnly ? "/admin/login" : "/login"} replace />;
  }

  if (profile?.is_banned) {
    supabase.auth.signOut();
    return <Navigate to="/login" replace />;
  }

  const isAdmin = profile?.role === 'admin' || session.user.email === 'admin@voiceforge.com';

  if (adminOnly && !isAdmin) {
    return <Navigate to="/projects" replace />;
  }

  if (!adminOnly && isAdmin && !window.location.pathname.startsWith('/admin')) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return children;
}

function App() {
  return (
    <>
      <Toaster position="top-center" />
      <SystemAnnouncement />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Auth />} />
          <Route path="/register" element={<Auth />} />
          
          <Route path="/admin/login" element={<AdminAuth />} />
          
          <Route path="/admin" element={
            <ProtectedRoute adminOnly={true}>
              <AdminLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="logs" element={<AdminLogs />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>

          <Route path="/projects" element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } />
          <Route 
            path="/profile" 
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            } 
          />
          <Route path="/app/:projectId" element={
            <ProtectedRoute>
              <Workspace />
            </ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/projects" replace />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
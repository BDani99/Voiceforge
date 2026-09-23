import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthProvider';
import { useAuth } from './hooks/useAuth';
import Auth from './pages/Auth/Auth';
import Workspace from './pages/Workspace/Workspace';
import Dashboard from './pages/Dashboard/Dashboard';
import Profile from './pages/Profile/Profile';
import AdminDashboard from './pages/Admin/AdminDashboard';
import AdminAuth from './pages/Admin/AdminAuth';
import AdminLayout from './pages/Admin/AdminLayout';
import AdminUsers from './pages/Admin/AdminUsers';
import AdminLogs from './pages/Admin/AdminLogs';
import AdminSettings from './pages/Admin/AdminSettings';
import LoadingScreen from './components/LoadingScreen/LoadingScreen';
import SystemAnnouncement from './components/SystemAnnouncement/SystemAnnouncement';

function ProtectedRoute({ children, adminOnly = false }) {
  const { session, loading, isAdmin, isBanned } = useAuth();
  const { pathname } = useLocation();

  if (loading) return <LoadingScreen />;

  if (!session || isBanned) {
    return <Navigate to={adminOnly ? '/admin/login' : '/login'} replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/projects" replace />;
  }

  // Admins only work in the admin area.
  if (!adminOnly && isAdmin && !pathname.startsWith('/admin')) {
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
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Auth />} />
            <Route path="/register" element={<Auth />} />

            <Route path="/admin/login" element={<AdminAuth />} />

            <Route path="/admin" element={
              <ProtectedRoute adminOnly>
                <AdminLayout />
              </ProtectedRoute>
            }>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="logs" element={<AdminLogs />} />
              <Route path="settings" element={<AdminSettings />} />
            </Route>

            <Route path="/projects" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/app/:projectId" element={<ProtectedRoute><Workspace /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/projects" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </>
  );
}

export default App;

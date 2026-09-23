import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import LoadingScreen from './LoadingScreen/LoadingScreen';

/** Redirects to the matching login page unless the visitor may see the route. */
export default function ProtectedRoute({ children, adminOnly = false }) {
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

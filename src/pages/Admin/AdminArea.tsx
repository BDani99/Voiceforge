import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from '../../components/ProtectedRoute';
import AdminAuth from './AdminAuth';
import AdminLayout from './AdminLayout';
import AdminDashboard from './AdminDashboard';
import AdminUsers from './AdminUsers';
import AdminLogs from './AdminLogs';
import AdminSettings from './AdminSettings';

/**
 * Everything below /admin. It is loaded as one lazy chunk, so regular users never
 * download the admin code, charts or styles (the admin pages share CSS with each other).
 */
export default function AdminArea() {
  return (
    <Routes>
      <Route path="login" element={<AdminAuth />} />
      <Route element={<ProtectedRoute adminOnly><AdminLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="logs" element={<AdminLogs />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

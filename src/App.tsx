import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthProvider';
import ProtectedRoute from './components/ProtectedRoute';
import Auth from './pages/Auth/Auth';
import Workspace from './pages/Workspace/Workspace';
import Dashboard from './pages/Dashboard/Dashboard';
import Profile from './pages/Profile/Profile';
import LoadingScreen from './components/LoadingScreen/LoadingScreen';
import SystemAnnouncement from './components/SystemAnnouncement/SystemAnnouncement';

const AdminArea = lazy(() => import('./pages/Admin/AdminArea'));

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

            <Route path="/admin/*" element={
              <Suspense fallback={<LoadingScreen />}>
                <AdminArea />
              </Suspense>
            } />

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

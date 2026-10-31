import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { Layout } from './components/Layout';
import { Loading, ToastProvider } from './components/ui';
import { I18nProvider } from './i18n';
import './index.css';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Sessions from './pages/Sessions';
import Contacts from './pages/Contacts';
import Campaigns from './pages/Campaigns';
import Rules from './pages/Rules';
import Leads from './pages/Leads';
import Inbox from './pages/Inbox';
import Developers from './pages/Developers';
import Settings from './pages/Settings';
import Tenants from './pages/admin/Tenants';
import Plans from './pages/admin/Plans';
import Vpn from './pages/admin/Vpn';
import { initTheme } from './theme';

initTheme();

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { me } = useAuth();
  if (me?.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Gate() {
  const { me, ready } = useAuth();
  if (!ready) return <div className="grid min-h-screen place-items-center"><Loading /></div>;
  if (!me) return <Login />;
  const router = createHashRouter([
    {
      path: '/',
      element: <Layout />,
      children: [
        { index: true, element: <Dashboard /> },
        { path: 'sessions', element: <Sessions /> },
        { path: 'contacts', element: <Contacts /> },
        { path: 'campaigns', element: <Campaigns /> },
        { path: 'rules', element: <Rules /> },
        { path: 'leads', element: <Leads /> },
        { path: 'inbox', element: <Inbox /> },
        { path: 'developers', element: <Developers /> },
        { path: 'settings', element: <Settings /> },
        { path: 'admin/tenants', element: <AdminOnly><Tenants /></AdminOnly> },
        { path: 'admin/plans', element: <AdminOnly><Plans /></AdminOnly> },
        { path: 'admin/vpn', element: <AdminOnly><Vpn /></AdminOnly> },
        { path: '*', element: <Navigate to="/" replace /> },
      ],
    },
  ]);
  return <RouterProvider router={router} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ToastProvider>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </ToastProvider>
    </I18nProvider>
  </StrictMode>,
);

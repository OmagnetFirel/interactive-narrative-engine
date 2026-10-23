import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import EditorWorkspace from './EditorWorkspace';
import ProjectsListPage from './pages/ProjectsListPage';
import LoginPage from './pages/LoginPage';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './auth/AuthContext';
import AcceptInvitePage from './pages/AcceptInvitePage';

/** Vite BASE_URL termina com `/`; React Router espera basename sem barra final (ou omitir na raiz). */
function routerBasename(): string | undefined {
  const raw = import.meta.env.BASE_URL ?? '/';
  const trimmed = raw.replace(/\/$/, '');
  return trimmed === '' ? undefined : trimmed;
}

// eslint-disable-next-line react-refresh/only-export-components
function RootWithAuth() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

export const router = createBrowserRouter(
  [
    {
      element: <RootWithAuth />,
      children: [
        { path: '/login', element: <LoginPage /> },
        { path: '/accept-invite/:token', element: <AcceptInvitePage /> },
        {
          element: <ProtectedRoute />,
          children: [
            { path: '/', element: <ProjectsListPage /> },
            { path: '/editor', element: <EditorWorkspace /> },
            { path: '/editor/:projectId', element: <EditorWorkspace /> },
          ],
        },
        { path: '*', element: <Navigate to="/" replace /> },
      ],
    },
  ],
  { basename: routerBasename() }
);

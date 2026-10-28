import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Layout } from '../components/layout';
import { UpdatePrompt } from '../components/update-prompt';
import { useMe } from '../lib/queries';
import { AdminPage } from '../pages/admin';
import { HomePage } from '../pages/home';
import { LoginPage } from '../pages/login';
import { RegisterPage } from '../pages/register';
import { SettingsPage } from '../pages/settings';

function RequireUser({ admin = false }: { admin?: boolean }) {
  const { data: me, isPending } = useMe();
  if (isPending) return <Splash />;
  if (!me) return <Navigate to="/login" replace />;
  if (admin && me.role !== 'admin') return <Navigate to="/" replace />;
  return <Outlet />;
}

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center text-stone-500">
      Loading…
    </div>
  );
}

export function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route element={<RequireUser />}>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route element={<RequireUser admin />}>
              <Route path="admin" element={<AdminPage />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <UpdatePrompt />
    </>
  );
}

export default App;

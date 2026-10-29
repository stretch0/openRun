import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Layout } from '../components/layout';
import { UpdatePrompt } from '../components/update-prompt';
import { useMe } from '../lib/queries';
import { ActivityPage } from '../pages/activity';
import { AddActivityPage } from '../pages/add-activity';
import { AdminPage } from '../pages/admin';
import { ClubPage } from '../pages/club';
import { ClubManagePage } from '../pages/club-manage';
import { ClubRunPage } from '../pages/club-run';
import { ClubCoffeePage } from '../pages/club-coffee';
import { ClubsPage, JoinClubPage } from '../pages/clubs';
import { HomePage } from '../pages/home';
import { LoginPage } from '../pages/login';
import { PrivacyPage } from '../pages/privacy';
import { RegisterPage } from '../pages/register';
import { SettingsPage } from '../pages/settings';
import { StatsPage } from '../pages/stats';

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
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route element={<RequireUser />}>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="activities/new" element={<AddActivityPage />} />
            <Route path="activities/:id" element={<ActivityPage />} />
            <Route path="stats" element={<StatsPage />} />
            <Route path="clubs" element={<ClubsPage />} />
            <Route path="clubs/join/:code" element={<JoinClubPage />} />
            <Route path="clubs/:id" element={<ClubPage />} />
            <Route path="clubs/:id/manage" element={<ClubManagePage />} />
            <Route path="clubs/:id/runs/:runId" element={<ClubRunPage />} />
            <Route
              path="clubs/:id/runs/:runId/coffee"
              element={<ClubCoffeePage />}
            />
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

import { NavLink, Outlet } from 'react-router-dom';
import { useInstance, useMe } from '../lib/queries';

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium ${
    isActive ? 'text-brand-600' : 'text-stone-500'
  }`;

export function Layout() {
  const { data: me } = useMe();
  const { data: instance } = useInstance();
  return (
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-stone-200 bg-stone-50/90 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur dark:border-stone-800 dark:bg-stone-950/90">
        <img src="/favicon.svg" alt="" className="h-7 w-7" />
        <span className="text-lg font-semibold">openRun</span>
        {instance?.demo && (
          <span className="ml-auto rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-500">
            Demo · resets nightly
          </span>
        )}
      </header>
      <main className="flex-1 space-y-4 px-4 py-4 pb-24">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-stone-800 dark:bg-stone-900/95">
        <div className="mx-auto flex max-w-2xl">
          <NavLink to="/" end className={tabClass}>
            <Icon d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z" />
            Runs
          </NavLink>
          <NavLink to="/clubs" className={tabClass}>
            <Icon d="M16 19v-1a4 4 0 00-4-4H6a4 4 0 00-4 4v1M9 10a3 3 0 100-6 3 3 0 000 6zm13 9v-1a4 4 0 00-3-3.9M16 4.1a3 3 0 010 5.8" />
            Clubs
          </NavLink>
          <NavLink to="/stats" className={tabClass}>
            <Icon d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
            Stats
          </NavLink>
          {me?.role === 'admin' && (
            <NavLink to="/admin" className={tabClass}>
              <Icon d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />
              Admin
            </NavLink>
          )}
          <NavLink to="/settings" className={tabClass}>
            <Icon d="M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.4 7.4 0 00-.1-1.3l2-1.6-2-3.4-2.4 1a7.5 7.5 0 00-2.2-1.3L14.4 3h-4l-.4 2.4a7.5 7.5 0 00-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 000 2.6l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 002.2 1.3l.4 2.4h4l.4-2.4a7.5 7.5 0 002.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3z" />
            Settings
          </NavLink>
        </div>
      </nav>
    </div>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

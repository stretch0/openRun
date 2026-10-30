import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { meSchema, type UpdateMe } from '@openrun/schemas';
import { FormError } from '../components/auth-card';
import { InstallButton } from '../components/install-button';
import { IntervalsSettings } from '../components/intervals-settings';
import { NotificationSettings } from '../components/notification-settings';
import { PrivacySettings } from '../components/privacy-settings';
import { ShoeSettings } from '../components/shoe-settings';
import { api } from '../lib/api';
import { authClient } from '../lib/auth-client';
import { authErrorMessage } from '../lib/auth-errors';
import { useMe } from '../lib/queries';
import { type ThemeChoice, useTheme } from '../lib/theme';

export function SettingsPage() {
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const updateMe = useMutation({
    mutationFn: (body: UpdateMe) =>
      api('/me', meSchema, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: (data) => queryClient.setQueryData(['me'], data),
  });

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    updateMe.mutate({
      name: String(form.get('name')),
      units: form.get('units') as UpdateMe['units'],
      timezone: String(form.get('timezone')),
    });
  };

  const signOut = async () => {
    await authClient.signOut();
    queryClient.clear();
    navigate('/login', { replace: true });
  };

  if (!me) return null;

  return (
    <>
      <h1 className="text-2xl font-semibold">Settings</h1>

      <form onSubmit={onSubmit} className="card space-y-3">
        <h2 className="font-semibold">Profile</h2>
        <div>
          <label className="label" htmlFor="name">
            Name
          </label>
          <input
            className="input"
            id="name"
            name="name"
            defaultValue={me.name}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="units">
            Units
          </label>
          <select
            className="input"
            id="units"
            name="units"
            defaultValue={me.units}
          >
            <option value="metric">Kilometres</option>
            <option value="imperial">Miles</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="timezone">
            Time zone
          </label>
          <select
            className="input"
            id="timezone"
            name="timezone"
            defaultValue={me.timezone}
          >
            {timeZones(me.timezone).map((tz: string) => (
              <option key={tz}>{tz}</option>
            ))}
          </select>
        </div>
        <button className="btn-primary" disabled={updateMe.isPending}>
          {updateMe.isSuccess ? 'Saved' : 'Save'}
        </button>
      </form>

      <IntervalsSettings />

      <NotificationSettings />

      <PrivacySettings />

      <ShoeSettings units={me.units} />

      <Passkeys />

      <ChangePassword />

      <section className="card space-y-3">
        <h2 className="font-semibold">Export your data</h2>
        <p className="text-sm text-stone-500">
          Every run with its laps and best efforts, plus your shoes. The
          original FIT and GPX files can be downloaded from each run.
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            className="btn-secondary"
            href="/api/export/activities.json"
            download
          >
            Download JSON
          </a>
          <a
            className="btn-secondary"
            href="/api/export/activities.csv"
            download
          >
            Download CSV
          </a>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">This device</h2>
        <Appearance />
        <InstallButton />
        <button className="btn-secondary w-full" onClick={signOut}>
          Sign out
        </button>
      </section>
    </>
  );
}

function timeZones(current: string) {
  const zones = Intl.supportedValuesOf?.('timeZone') ?? [];
  return zones.includes(current) ? zones : [current, ...zones];
}

function Passkeys() {
  const { data: passkeys, refetch } = authClient.useListPasskeys();
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setError(null);
    const result = await authClient.passkey.addPasskey({
      name: deviceName(),
    });
    if (result?.error)
      setError(result.error.message ?? 'Could not add passkey');
    refetch();
  };

  const remove = async (id: string) => {
    await authClient.passkey.deletePasskey({ id });
    refetch();
  };

  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Passkeys</h2>
      <p className="text-sm text-stone-500">
        Sign in with Face ID, Touch ID, Windows Hello or a security key instead
        of a password.
      </p>
      <FormError message={error} />
      <ul className="divide-y divide-stone-200 dark:divide-stone-800">
        {passkeys?.map((p) => (
          <li key={p.id} className="flex items-center justify-between py-2">
            <span>{p.name || 'Passkey'}</span>
            <button
              className="text-sm text-red-600"
              onClick={() => remove(p.id)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <button className="btn-secondary w-full" onClick={add}>
        Add a passkey
      </button>
    </section>
  );
}

function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return 'iPhone or iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'This device';
}

function ChangePassword() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    setError(null);
    setDone(false);
    setBusy(true);
    const { error } = await authClient.changePassword({
      currentPassword: String(form.get('currentPassword')),
      newPassword: String(form.get('newPassword')),
      revokeOtherSessions: true,
    });
    setBusy(false);
    if (error) {
      setError(authErrorMessage(error, 'Could not change your password'));
      return;
    }
    formEl.reset();
    setDone(true);
  };

  return (
    <form onSubmit={onSubmit} className="card space-y-3">
      <h2 className="font-semibold">Password</h2>
      <div>
        <label className="label" htmlFor="currentPassword">
          Current password
        </label>
        <input
          className="input"
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="newPassword">
          New password
        </label>
        <input
          className="input"
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <FormError message={error} />
      {done && (
        <p className="text-sm text-stone-500">
          Password changed. Other devices have been signed out.
        </p>
      )}
      <button className="btn-secondary" disabled={busy}>
        Change password
      </button>
    </form>
  );
}

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'Match device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function Appearance() {
  const [theme, setTheme] = useTheme();
  return (
    <div>
      <p className="label" id="appearance">
        Appearance
      </p>
      <div
        className="flex rounded-lg bg-stone-100 p-1 text-sm dark:bg-stone-800"
        role="group"
        aria-labelledby="appearance"
      >
        {THEMES.map((t) => (
          <button
            key={t.value}
            type="button"
            className={`flex-1 rounded-md px-3 py-1.5 ${
              theme === t.value
                ? 'bg-white font-medium shadow-sm dark:bg-stone-700'
                : 'text-stone-500'
            }`}
            aria-pressed={theme === t.value}
            onClick={() => setTheme(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

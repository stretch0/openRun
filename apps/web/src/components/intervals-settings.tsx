import { type FormEvent, useState } from 'react';
import type { IntegrationSync, IntervalsConnection } from '@openrun/schemas';
import {
  useConnectIntervals,
  useDisconnectIntervals,
  useIntegrations,
  useSyncIntervals,
  useUpdateIntervals,
} from '../lib/integrations';
import { useInstance } from '../lib/queries';
import { FormError } from './auth-card';

const INTERVALS = 'https://intervals.icu';

export function IntervalsSettings() {
  const { data } = useIntegrations();
  if (!data) return null;
  const { available, connection } = data.intervals;

  return (
    <section className="card space-y-4" aria-label="Sync from your watch">
      <div>
        <h2 className="font-semibold">Sync from your watch</h2>
        <p className="mt-1 text-sm text-stone-500">
          Runs come in automatically through{' '}
          <a
            className="text-brand-600"
            href={INTERVALS}
            target="_blank"
            rel="noreferrer"
          >
            intervals.icu
          </a>
          , a free training site that Garmin, Coros, Polar, Suunto and Wahoo
          sync to. openRun gets the original file from your watch.
        </p>
      </div>
      {!available ? (
        <p className="text-sm text-stone-500">
          Syncing is turned off on this server. You can still upload FIT and GPX
          files.
        </p>
      ) : connection ? (
        <Connected connection={connection} />
      ) : (
        <Connect />
      )}
    </section>
  );
}

function Connect() {
  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>
          Create an account at{' '}
          <a
            className="text-brand-600"
            href={INTERVALS}
            target="_blank"
            rel="noreferrer"
          >
            intervals.icu
          </a>{' '}
          and connect your watch under <strong>Settings → Connections</strong>.
          Connect the watch itself, not Strava: intervals.icu can't pass on runs
          that came from Strava.
        </li>
        <li>
          On intervals.icu, open <strong>Settings → Developer Settings</strong>{' '}
          and copy your API key.
        </li>
        <li>Paste it below.</li>
      </ol>
      <KeyForm label="Connect" withStartDate />
    </div>
  );
}

function KeyForm({
  label,
  withStartDate = false,
}: {
  label: string;
  withStartDate?: boolean;
}) {
  const connect = useConnectIntervals();
  const sync = useSyncIntervals();
  const { data } = useIntegrations();
  const { data: instance } = useInstance();
  const current = data?.intervals.connection;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    connect.mutate(
      {
        apiKey: String(form.get('apiKey')),
        syncFrom: String(form.get('syncFrom') ?? current?.syncFrom),
      },
      { onSuccess: () => sync.mutate(undefined) },
    );
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className="label" htmlFor="intervalsKey">
          intervals.icu API key
        </label>
        <input
          className="input font-mono"
          id="intervalsKey"
          name="apiKey"
          type="password"
          autoComplete="off"
          spellCheck={false}
          required
        />
      </div>
      {withStartDate && (
        <div>
          <label className="label" htmlFor="syncFrom">
            Import runs from
          </label>
          <input
            className="input"
            id="syncFrom"
            name="syncFrom"
            type="date"
            defaultValue={startOfYear()}
            max={today()}
            required
          />
        </div>
      )}
      <p className="text-xs text-stone-500">
        The key is stored encrypted. Whoever runs this server
        {instance?.contact ? ` (${instance.contact})` : ''} could still use it
        to read and change your intervals.icu account, though not your watch
        maker's account. To cut it off, disconnect here or make a new key on
        intervals.icu.
      </p>
      <FormError message={connect.error?.message ?? null} />
      <button className="btn-primary" disabled={connect.isPending}>
        {connect.isPending ? 'Checking the key…' : label}
      </button>
    </form>
  );
}

function Connected({ connection }: { connection: IntervalsConnection }) {
  const sync = useSyncIntervals();
  const update = useUpdateIntervals();
  const disconnect = useDisconnectIntervals();
  const [syncFrom, setSyncFrom] = useState(connection.syncFrom);
  // Follow the saved date when it changes elsewhere (another device, a sync).
  const [saved, setSaved] = useState(connection.syncFrom);
  if (saved !== connection.syncFrom) {
    setSaved(connection.syncFrom);
    setSyncFrom(connection.syncFrom);
  }
  const syncing = sync.isPending || connection.syncing;
  const latest = connection.syncs[0];

  const changeStart = (value: string) => {
    setSyncFrom(value);
    if (value) update.mutate(value);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1 text-sm">
        <p>
          Connected to{' '}
          <span className="font-medium">
            {connection.accountName ?? 'intervals.icu'}
          </span>{' '}
          <span className="text-stone-500">({connection.accountId})</span>
        </p>
        <p className="text-stone-500" role="status">
          {syncing
            ? 'Syncing…'
            : connection.lastSyncAt
              ? `Last synced ${timeAgo(connection.lastSyncAt)}`
              : 'Not synced yet'}
          {' · '}
          {connection.importedCount === 1
            ? '1 run imported'
            : `${connection.importedCount} runs imported`}
          {!syncing && latest?.more && ' · more on the way'}
        </p>
      </div>

      {connection.status === 'needs_key' ? (
        <div className="space-y-3 rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-500/10">
          <p>
            intervals.icu no longer accepts the saved key, so syncing has
            stopped. Paste your current key to start again.
          </p>
          <KeyForm label="Save key" />
        </div>
      ) : (
        connection.status === 'error' &&
        connection.lastError && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Last sync didn't finish: {connection.lastError}. It will try again
            in half an hour.
          </p>
        )
      )}

      <div>
        <label className="label" htmlFor="syncFromConnected">
          Import runs from
        </label>
        <input
          className="input"
          id="syncFromConnected"
          type="date"
          value={syncFrom}
          max={today()}
          onChange={(e) => changeStart(e.target.value)}
        />
        <p className="mt-1 text-xs text-stone-500">
          Going further back fetches the older runs over the next few syncs.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          className="btn-secondary"
          disabled={syncing || connection.status === 'needs_key'}
          onClick={() => sync.mutate(undefined)}
        >
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
        <button
          className="btn-secondary text-red-600"
          disabled={disconnect.isPending}
          onClick={() => {
            if (
              window.confirm(
                'Disconnect intervals.icu? Runs already imported stay in your log.',
              )
            )
              disconnect.mutate(undefined);
          }}
        >
          Disconnect
        </button>
      </div>
      <FormError message={sync.error?.message ?? null} />

      {connection.syncs.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-stone-500">Sync log</summary>
          <ul className="mt-2 divide-y divide-stone-200 dark:divide-stone-800">
            {connection.syncs.map((s) => (
              <li key={s.startedAt} className="flex justify-between gap-3 py-2">
                <span className="shrink-0 text-stone-500">
                  {new Date(s.startedAt).toLocaleString(undefined, {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </span>
                <span className="text-right">{describeSync(s)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function describeSync(s: IntegrationSync) {
  const parts = [];
  if (s.imported) parts.push(`${s.imported} new`);
  if (s.duplicates) parts.push(`${s.duplicates} already here`);
  if (s.failed) parts.push(`${s.failed} couldn't be read`);
  if (s.unavailable)
    parts.push(
      `${s.unavailable} from Strava, which intervals.icu can't pass on`,
    );
  if (s.removed)
    parts.push(`${s.removed} removed, now another sport on intervals.icu`);
  if (s.error) parts.push(s.error);
  if (!parts.length) parts.push('Nothing new');
  if (s.more) parts.push('more next time');
  return parts.join(' · ');
}

function timeAgo(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  return new Date(iso).toLocaleDateString();
}

const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => localDay(new Date());
const startOfYear = () => `${new Date().getFullYear()}-01-01`;

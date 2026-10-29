import { useState } from 'react';
import type {
  ReminderPrefInput,
  UpdateNotificationSettings,
} from '@openrun/schemas';
import {
  needsHomeScreen,
  pushSupported,
  useNotificationSettings,
  usePushOnThisDevice,
  useUpdateNotificationSettings,
} from '../lib/notifications';
import { FormError } from './auth-card';

const REMINDER_LABELS: Record<ReminderPrefInput, string> = {
  auto: 'Automatic (recommended)',
  evening: 'The evening before (7pm)',
  '2h': '2 hours before',
  '1h': '1 hour before',
  off: 'No reminders',
};

export function NotificationSettings() {
  const { data: settings } = useNotificationSettings();
  const update = useUpdateNotificationSettings();
  const device = usePushOnThisDevice();
  // Changes show at once; saves can finish out of order, so the form keeps
  // its own copy rather than waiting for each response.
  const [edits, setEdits] = useState<UpdateNotificationSettings>({});
  const current = settings && { ...settings, ...edits };
  const change = (patch: UpdateNotificationSettings) => {
    setEdits((e) => ({ ...e, ...patch }));
    update.mutate(patch);
  };

  return (
    <section className="card space-y-4" aria-label="Notifications">
      <div>
        <h2 className="font-semibold">Notifications</h2>
        <p className="text-sm text-stone-500">
          Reminders and changes for club runs you're going to, sent by this
          server straight to your device.
        </p>
      </div>

      <ThisDevice device={device} />

      {current && (
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="runReminder">
              Run reminders
            </label>
            <select
              className="input"
              id="runReminder"
              value={current.runReminder}
              onChange={(e) =>
                change({
                  runReminder: e.target.value as ReminderPrefInput,
                })
              }
            >
              {Object.entries(REMINDER_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-stone-500">
              Automatic reminds you at 7pm the evening before a morning run (one
              starting before 10am), and 2 hours before any other run.
            </p>
          </div>
          <Toggle
            label="Coffee orders closing soon, if I haven't ordered"
            checked={current.coffeeNudge}
            onChange={(coffeeNudge) => change({ coffeeNudge })}
          />
          <Toggle
            label="A run I'm going to is cancelled, moved or taken off"
            checked={current.runChanges}
            onChange={(runChanges) => change({ runChanges })}
          />
          <Toggle
            label="Someone asks to join a club I organise"
            checked={current.joinRequests}
            onChange={(joinRequests) => change({ joinRequests })}
          />
          <p className="text-xs text-stone-500">
            You can also mute a whole club from its page.
          </p>
          <FormError message={update.error?.message} />
        </div>
      )}
    </section>
  );
}

function ThisDevice({
  device,
}: {
  device: ReturnType<typeof usePushOnThisDevice>;
}) {
  if (!pushSupported()) {
    return (
      <p className="rounded-lg bg-stone-100 px-3 py-2 text-sm dark:bg-stone-800">
        {needsHomeScreen()
          ? 'On iPhone and iPad, add openRun to your Home Screen first (Share → Add to Home Screen), then open it from there to turn notifications on.'
          : "This browser can't show notifications."}
      </p>
    );
  }
  if (device.permission === 'denied') {
    return (
      <p className="rounded-lg bg-stone-100 px-3 py-2 text-sm dark:bg-stone-800">
        Notifications are blocked for openRun on this device. Allow them in your
        browser or phone settings, then come back here.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {device.subscribed ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto text-sm font-medium">
            On for this device
          </span>
          <button
            className="btn-secondary"
            disabled={device.busy}
            onClick={device.test}
          >
            Send a test
          </button>
          <button
            className="btn-secondary"
            disabled={device.busy}
            onClick={device.turnOff}
          >
            Turn off
          </button>
        </div>
      ) : (
        <button
          className="btn-primary w-full"
          disabled={device.busy || device.subscribed === null}
          onClick={device.turnOn}
        >
          Turn on notifications on this device
        </button>
      )}
      <FormError message={device.error} />
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 accent-brand-600"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

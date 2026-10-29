import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import {
  type UpdateNotificationSettings,
  notificationSettingsSchema,
  pushKeySchema,
} from '@openrun/schemas';
import { api } from './api';

const SETTINGS_KEY = ['notifications', 'settings'];

export function useNotificationSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => api('/notifications/settings', notificationSettingsSchema),
  });
}

export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateNotificationSettings) =>
      api('/notifications/settings', notificationSettingsSchema, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    // Refetch rather than storing each response, so an older save can't
    // overwrite a newer choice.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}

export const pushSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

/** iPhones and iPads only allow notifications from a Home Screen app. */
export const needsHomeScreen = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !window.matchMedia('(display-mode: standalone)').matches;

/** The VAPID key as the bytes pushManager.subscribe wants. */
function keyBytes(base64url: string) {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Whether this device gets notifications, and switches to change that. */
export function usePushOnThisDevice() {
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [permission, setPermission] = useState(() =>
    pushSupported() ? Notification.permission : 'denied',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!pushSupported()) return;
    void navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(Boolean(sub)));
  }, []);

  const run = useCallback(async (job: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await job();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }, []);

  const turnOn = () =>
    run(async () => {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') return;
      const { publicKey } = await api('/notifications/key', pushKeySchema);
      if (!publicKey) throw new Error('This server can’t send notifications.');
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(publicKey),
      });
      await api('/notifications/subscriptions', z.undefined(), {
        method: 'POST',
        body: JSON.stringify(sub.toJSON()),
      });
      setSubscribed(true);
    });

  const turnOff = () =>
    run(async () => {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api('/notifications/subscriptions', z.undefined(), {
          method: 'DELETE',
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    });

  const test = () =>
    run(() => api('/notifications/test', z.undefined(), { method: 'POST' }));

  return { subscribed, permission, busy, error, turnOn, turnOff, test };
}

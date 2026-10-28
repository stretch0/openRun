import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  type CreatePrivacyZone,
  type UpdatePrivacySettings,
  type Visibility,
  privacySettingsSchema,
  privacyZoneSchema,
} from '@openrun/schemas';
import { api } from './api';

const SETTINGS_KEY = ['privacy', 'settings'];
const ZONES_KEY = ['privacy', 'zones'];

export function usePrivacySettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => api('/privacy/settings', privacySettingsSchema),
  });
}

export function useUpdatePrivacySettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdatePrivacySettings) =>
      api('/privacy/settings', privacySettingsSchema, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    // Refetch rather than storing each response: saves can finish out of
    // order, and an older response mustn't overwrite a newer choice.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: SETTINGS_KEY }),
        // Shared previews depend on whether maps are shared.
        queryClient.invalidateQueries({ queryKey: ['activities'] }),
      ]),
  });
}

export function usePrivacyZones() {
  return useQuery({
    queryKey: ZONES_KEY,
    queryFn: () => api('/privacy/zones', z.array(privacyZoneSchema)),
  });
}

function useRefreshZones() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: ZONES_KEY });
    await queryClient.invalidateQueries({ queryKey: ['activities'] });
  };
}

export function useCreatePrivacyZone() {
  const onSuccess = useRefreshZones();
  return useMutation({
    mutationFn: (body: CreatePrivacyZone) =>
      api('/privacy/zones', privacyZoneSchema, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess,
  });
}

export function useDeletePrivacyZone() {
  const onSuccess = useRefreshZones();
  return useMutation({
    mutationFn: (id: string) =>
      api(`/privacy/zones/${id}`, z.undefined(), { method: 'DELETE' }),
    onSuccess,
  });
}

export function useSetAllVisibility() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (visibility: Visibility) =>
      api('/activities/visibility', z.object({ updated: z.number() }), {
        method: 'PATCH',
        body: JSON.stringify({ visibility }),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['activities'] }),
  });
}

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  private: 'Only me',
  clubs: 'My clubs',
};

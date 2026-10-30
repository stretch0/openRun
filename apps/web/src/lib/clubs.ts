import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  type CreateClub,
  type CreateClubRun,
  type CreateLocation,
  type CreateMenuItem,
  type LogoPlacement,
  type CreateSeries,
  type OrderInput,
  type RsvpInput,
  type ShareLevel,
  type UpdateClub,
  type UpdateClubRun,
  type UpdateMember,
  type UpdateMenuItem,
  type UpdateSeries,
  type UsualInput,
  clubHighlightsSchema,
  clubLogoSchema,
  clubPreviewSchema,
  clubRunDetailSchema,
  clubRunSchema,
  clubSchema,
  clubSummarySchema,
  locationSchema,
  menuItemSchema,
  orderSummarySchema,
  runCoffeeSchema,
  seriesSchema,
  usualSchema,
} from '@openrun/schemas';
import { api } from './api';

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export function useClubs() {
  return useQuery({
    queryKey: ['clubs'],
    queryFn: () => api('/clubs', z.array(clubSummarySchema)),
  });
}

export function useClub(id: string) {
  return useQuery({
    queryKey: ['clubs', id],
    queryFn: () => api(`/clubs/${id}`, clubSchema),
  });
}

export function useClubRuns(
  id: string,
  when: 'upcoming' | 'past' = 'upcoming',
) {
  return useQuery({
    queryKey: ['clubs', id, 'runs', when],
    queryFn: () =>
      api(`/clubs/${id}/runs?when=${when}`, z.array(clubRunSchema)),
  });
}

export function useClubRun(clubId: string, runId: string) {
  return useQuery({
    queryKey: ['clubs', clubId, 'run', runId],
    queryFn: () => api(`/clubs/${clubId}/runs/${runId}`, clubRunDetailSchema),
  });
}

/** The cashier view. Kept for offline use: the service worker caches it too. */
export function useOrderSummary(clubId: string, runId: string, enabled = true) {
  return useQuery({
    queryKey: ['clubs', clubId, 'run', runId, 'orders'],
    queryFn: () =>
      api(`/clubs/${clubId}/runs/${runId}/orders`, orderSummarySchema),
    enabled,
  });
}

export function useClubHighlights(id: string) {
  return useQuery({
    queryKey: ['clubs', id, 'highlights'],
    queryFn: () => api(`/clubs/${id}/highlights`, clubHighlightsSchema),
  });
}

export function useClubPreview(code: string) {
  return useQuery({
    queryKey: ['clubs', 'preview', code],
    queryFn: () => api(`/clubs/preview/${code}`, clubPreviewSchema),
    retry: false,
  });
}

/** Any club change can affect lists, runs and counts, so refresh them all. */
function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['clubs'] });
}

export function useCreateClub() {
  const onSuccess = useRefresh();
  return useMutation({
    mutationFn: (body: CreateClub) =>
      api('/clubs', clubSchema, json('POST', body)),
    onSuccess,
  });
}

export function useJoinClub() {
  const onSuccess = useRefresh();
  return useMutation({
    mutationFn: (code: string) =>
      api('/clubs/join', clubSummarySchema, json('POST', { code })),
    onSuccess,
  });
}

/** Requests that change one club. Use with useClubMutation. */
export function clubApi(clubId: string) {
  const base = `/clubs/${clubId}`;
  return {
    update: (body: UpdateClub) => api(base, clubSchema, json('PATCH', body)),
    remove: () => api(base, z.undefined(), json('DELETE')),
    newCode: () => api(`${base}/join-code`, clubSchema, json('POST')),
    uploadLogo: ({
      file,
      placement,
    }: {
      file: File;
      placement: LogoPlacement;
    }) => {
      const body = new FormData();
      body.append('logo', file);
      for (const [key, value] of Object.entries(placement)) {
        body.append(key, String(value));
      }
      return api(`${base}/logo`, clubLogoSchema, { method: 'PUT', body });
    },
    removeLogo: () => api(`${base}/logo`, clubLogoSchema, json('DELETE')),
    transfer: (userId: string) =>
      api(`${base}/transfer`, clubSchema, json('POST', { userId })),
    setShareLevel: (shareLevel: ShareLevel) =>
      api(`${base}/me`, clubSummarySchema, json('PATCH', { shareLevel })),
    setMuted: (muted: boolean) =>
      api(`${base}/me`, clubSummarySchema, json('PATCH', { muted })),
    setHighlights: (highlights: boolean) =>
      api(`${base}/me`, clubSummarySchema, json('PATCH', { highlights })),
    updateMember: ({ userId, ...body }: UpdateMember & { userId: string }) =>
      api(`${base}/members/${userId}`, clubSchema, json('PATCH', body)),
    removeMember: (userId: string) =>
      api(`${base}/members/${userId}`, z.undefined(), json('DELETE')),
    addLocation: (body: CreateLocation) =>
      api(`${base}/locations`, locationSchema, json('POST', body)),
    removeLocation: (id: string) =>
      api(`${base}/locations/${id}`, z.undefined(), json('DELETE')),
    addSeries: (body: CreateSeries) =>
      api(`${base}/series`, seriesSchema, json('POST', body)),
    updateSeries: ({ id, ...body }: UpdateSeries & { id: string }) =>
      api(`${base}/series/${id}`, seriesSchema, json('PATCH', body)),
    addRun: (body: CreateClubRun) =>
      api(`${base}/runs`, clubRunDetailSchema, json('POST', body)),
    updateRun: ({ id, ...body }: UpdateClubRun & { id: string }) =>
      api(`${base}/runs/${id}`, clubRunDetailSchema, json('PATCH', body)),
    rsvp: ({ runId, ...body }: RsvpInput & { runId: string }) =>
      api(`${base}/runs/${runId}/rsvp`, clubRunDetailSchema, json('PUT', body)),
    addMenuItem: (body: CreateMenuItem) =>
      api(`${base}/menu`, menuItemSchema, json('POST', body)),
    updateMenuItem: ({ id, ...body }: UpdateMenuItem & { id: string }) =>
      api(`${base}/menu/${id}`, menuItemSchema, json('PATCH', body)),
    order: ({ runId, ...body }: OrderInput & { runId: string }) =>
      api(`${base}/runs/${runId}/order`, runCoffeeSchema, json('PUT', body)),
    removeOrder: (runId: string) =>
      api(`${base}/runs/${runId}/order`, runCoffeeSchema, json('DELETE')),
    setUsual: (body: UsualInput) =>
      api(`${base}/usual`, usualSchema, json('PUT', body)),
    removeUsual: () => api(`${base}/usual`, z.undefined(), json('DELETE')),
  };
}

/** A mutation that refreshes club data when it succeeds. */
export function useClubMutation<TArg, TResult>(
  mutationFn: (arg: TArg) => Promise<TResult>,
) {
  const onSuccess = useRefresh();
  return useMutation({ mutationFn, onSuccess });
}

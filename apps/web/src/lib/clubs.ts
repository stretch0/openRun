import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  type CreateClub,
  type CreateClubRun,
  type CreateLocation,
  type CreateSeries,
  type RsvpInput,
  type ShareLevel,
  type UpdateClub,
  type UpdateClubRun,
  type UpdateMember,
  type UpdateSeries,
  clubPreviewSchema,
  clubRunDetailSchema,
  clubRunSchema,
  clubSchema,
  clubSummarySchema,
  locationSchema,
  seriesSchema,
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
    setShareLevel: (shareLevel: ShareLevel) =>
      api(`${base}/me`, clubSummarySchema, json('PATCH', { shareLevel })),
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
  };
}

/** A mutation that refreshes club data when it succeeds. */
export function useClubMutation<TArg, TResult>(
  mutationFn: (arg: TArg) => Promise<TResult>,
) {
  const onSuccess = useRefresh();
  return useMutation({ mutationFn, onSuccess });
}

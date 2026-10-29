import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { z } from 'zod';
import {
  activityListSchema,
  activitySchema,
  activityStreamSchema,
  type CreateActivity,
  importResultSchema,
  personalBestSchema,
  shareTargetSchema,
  type UpdateActivity,
} from '@openrun/schemas';
import { api } from './api';
import { useMe } from './queries';

export function useActivityList() {
  return useInfiniteQuery({
    queryKey: ['activities', 'list'],
    queryFn: ({ pageParam }) =>
      api(
        `/activities?limit=20${pageParam ? `&before=${pageParam}` : ''}`,
        activityListSchema,
      ),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useActivity(id: string) {
  // Splits follow the user's units, so refetch when they change.
  const units = useMe().data?.units;
  return useQuery({
    queryKey: ['activities', id, units],
    queryFn: () => api(`/activities/${id}`, activitySchema),
  });
}

/** `shared` is what others would see: privacy zones applied. */
export function useActivityStream(
  id: string,
  enabled: boolean,
  view: 'owner' | 'shared' = 'owner',
) {
  return useQuery({
    queryKey: ['activities', id, 'stream', view],
    queryFn: () =>
      api(`/activities/${id}/stream?view=${view}`, activityStreamSchema),
    enabled,
    // The owner's view never changes; the shared one follows privacy settings.
    staleTime: view === 'owner' ? Infinity : 0,
  });
}

export function usePersonalBests() {
  return useQuery({
    queryKey: ['activities', 'personal-bests'],
    queryFn: () => api('/personal-bests', z.array(personalBestSchema)),
  });
}

/** Everything under ['activities'] can change when one activity does. */
function useInvalidateActivities() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['activities'] });
}

export function useImportFiles() {
  const invalidate = useInvalidateActivities();
  return useMutation({
    mutationFn: (files: File[]) => {
      const form = new FormData();
      for (const f of files) form.append('files', f);
      return api('/activities/import', z.array(importResultSchema), {
        method: 'POST',
        body: form,
      });
    },
    onSuccess: invalidate,
  });
}

export function useCreateActivity() {
  const invalidate = useInvalidateActivities();
  return useMutation({
    mutationFn: (body: CreateActivity) =>
      api('/activities', activitySchema, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateActivity(id: string) {
  const invalidate = useInvalidateActivities();
  return useMutation({
    mutationFn: (body: UpdateActivity) =>
      api(`/activities/${id}`, activitySchema, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api(`/activities/${id}`, z.undefined(), { method: 'DELETE' }),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: ['activities', id] });
      return queryClient.invalidateQueries({ queryKey: ['activities'] });
    },
  });
}

/** Clubs this run could be shared with, and where it already is. */
export function useShareTargets(id: string) {
  return useQuery({
    queryKey: ['activities', id, 'clubs'],
    queryFn: () => api(`/activities/${id}/clubs`, z.array(shareTargetSchema)),
  });
}

export function useShareRun(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ clubId, share }: { clubId: string; share: boolean }) =>
      api(`/activities/${id}/clubs/${clubId}`, z.array(shareTargetSchema), {
        method: share ? 'PUT' : 'DELETE',
      }),
    // Sharing can change the run's visibility, and the clubs' pages.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['activities'] }),
        queryClient.invalidateQueries({ queryKey: ['clubs'] }),
      ]),
  });
}

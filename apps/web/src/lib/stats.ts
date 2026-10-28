import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  type CreateShoe,
  type UpdateShoe,
  shoeSchema,
  statsSchema,
} from '@openrun/schemas';
import { api } from './api';

// Stats and shoe mileage depend on activities, so they live under
// ['activities'] and refresh whenever an activity changes.
const STATS_KEY = ['activities', 'stats'];
const SHOES_KEY = ['activities', 'shoes'];

export function useStats() {
  return useQuery({
    queryKey: STATS_KEY,
    queryFn: () => api('/stats', statsSchema),
  });
}

export function useShoes() {
  return useQuery({
    queryKey: SHOES_KEY,
    queryFn: () => api('/shoes', z.array(shoeSchema)),
  });
}

function useRefreshShoes() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['activities'] });
}

export function useCreateShoe() {
  const onSuccess = useRefreshShoes();
  return useMutation({
    mutationFn: (body: CreateShoe) =>
      api('/shoes', shoeSchema, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess,
  });
}

export function useUpdateShoe() {
  const onSuccess = useRefreshShoes();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateShoe & { id: string }) =>
      api(`/shoes/${id}`, shoeSchema, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess,
  });
}

export function useDeleteShoe() {
  const onSuccess = useRefreshShoes();
  return useMutation({
    mutationFn: (id: string) =>
      api(`/shoes/${id}`, z.undefined(), { method: 'DELETE' }),
    onSuccess,
  });
}

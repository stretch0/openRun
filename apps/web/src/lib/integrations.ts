import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type ConnectIntervals,
  type Integrations,
  integrationsSchema,
} from '@openrun/schemas';
import { api } from './api';

const KEY = ['integrations'];

export function useIntegrations() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api('/integrations', integrationsSchema),
  });
}

function useIntegrationMutation<T>(call: (body: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: call,
    onSuccess: (data) => {
      queryClient.setQueryData(KEY, data);
      // New runs may have arrived; stats are keyed under activities too.
      void queryClient.invalidateQueries({ queryKey: ['activities'] });
    },
  });
}

export const useConnectIntervals = () =>
  useIntegrationMutation((body: ConnectIntervals) =>
    api('/integrations/intervals', integrationsSchema, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  );

export const useUpdateIntervals = () =>
  useIntegrationMutation((syncFrom: string) =>
    api('/integrations/intervals', integrationsSchema, {
      method: 'PATCH',
      body: JSON.stringify({ syncFrom }),
    }),
  );

/** Enough for about 1,000 runs at 25 a sync; scheduled syncs fetch the rest. */
const MAX_SYNC_ROUNDS = 40;

/**
 * Each sync imports a batch of runs, so keep syncing until nothing is left,
 * updating the counts after each batch.
 */
export function useSyncIntervals() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      let data: Integrations | undefined;
      for (let round = 0; round < MAX_SYNC_ROUNDS; round++) {
        data = await api('/integrations/intervals/sync', integrationsSchema, {
          method: 'POST',
        });
        queryClient.setQueryData(KEY, data);
        void queryClient.invalidateQueries({ queryKey: ['activities'] });
        const latest = data.intervals.connection?.syncs[0];
        // Stop if a batch got nowhere, rather than asking again and again.
        const handled = latest
          ? latest.imported + latest.duplicates + latest.failed
          : 0;
        if (!latest?.more || handled === 0) break;
      }
      return data;
    },
  });
}

export const useDisconnectIntervals = () =>
  useIntegrationMutation(() =>
    api('/integrations/intervals', integrationsSchema, { method: 'DELETE' }),
  );

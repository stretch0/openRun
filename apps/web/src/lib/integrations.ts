import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ConnectIntervals, integrationsSchema } from '@openrun/schemas';
import { api } from './api';

const KEY = ['integrations'];

export function useIntegrations() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api('/integrations', integrationsSchema),
    // A sync can start without this page asking, e.g. after connecting.
    refetchInterval: (query) =>
      query.state.data?.intervals.connection?.syncing ? 2000 : false,
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

export const useSyncIntervals = () =>
  useIntegrationMutation(() =>
    api('/integrations/intervals/sync', integrationsSchema, { method: 'POST' }),
  );

export const useDisconnectIntervals = () =>
  useIntegrationMutation(() =>
    api('/integrations/intervals', integrationsSchema, { method: 'DELETE' }),
  );

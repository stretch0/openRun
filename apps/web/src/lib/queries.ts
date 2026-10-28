import { useQuery } from '@tanstack/react-query';
import { instanceInfoSchema, meSchema } from '@openrun/schemas';
import { api, ApiError } from './api';

export function useInstance() {
  return useQuery({
    queryKey: ['instance'],
    queryFn: () => api('/instance', instanceInfoSchema),
  });
}

/** The signed-in user, or null when signed out. */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api('/me', meSchema);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
  });
}

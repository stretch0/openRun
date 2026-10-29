import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { placeSchema } from '@openrun/schemas';
import { api } from './api';

/** Places matching `q`, preferring ones near `near`. Searches only when `q` is set. */
export function usePlaceSearch(
  q: string,
  near: { lat: number; lng: number } | null,
) {
  return useQuery({
    queryKey: ['places', q, near?.lat, near?.lng],
    queryFn: () => {
      const params = new URLSearchParams({ q });
      if (near) {
        params.set('lat', String(near.lat));
        params.set('lng', String(near.lng));
      }
      return api(`/places?${params}`, z.array(placeSchema));
    },
    enabled: q.length >= 2,
    staleTime: Infinity,
    retry: false,
  });
}

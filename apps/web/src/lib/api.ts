import type { z } from 'zod';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Calls the openRun API and validates the response with `schema`. */
export async function api<T extends z.ZodType>(
  path: string,
  schema: T,
  init: RequestInit = {},
): Promise<z.infer<T>> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      // FormData sets its own multipart content type.
      ...(typeof init.body === 'string'
        ? { 'content-type': 'application/json' }
        : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  return schema.parse(res.status === 204 ? undefined : await res.json());
}

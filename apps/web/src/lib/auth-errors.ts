/** A readable message for a Better Auth error, with fixes for setup problems. */
export function authErrorMessage(
  error: { code?: string; message?: string } | null | undefined,
  fallback: string,
): string {
  if (error?.code === 'INVALID_ORIGIN') {
    return `This server doesn't accept sign-ins from ${window.location.origin}. Whoever runs it needs to set ORIGIN to this address, or add it to TRUSTED_ORIGINS.`;
  }
  return error?.message || fallback;
}

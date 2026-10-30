import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AuthCard, FormError } from '../components/auth-card';
import { authClient } from '../lib/auth-client';
import { authErrorMessage } from '../lib/auth-errors';
import { useInstance, useMe } from '../lib/queries';

export function LoginPage() {
  const { data: instance } = useInstance();
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (me) return <Navigate to="/" replace />;
  if (instance?.needsSetup) return <Navigate to="/register" replace />;

  const signedIn = async () => {
    await queryClient.invalidateQueries({ queryKey: ['me'] });
    navigate('/', { replace: true });
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.email({
      email: String(form.get('email')),
      password: String(form.get('password')),
    });
    setBusy(false);
    if (error) setError(authErrorMessage(error, 'Could not sign in'));
    else await signedIn();
  };

  const onDemo = async () => {
    if (!instance?.demo) return;
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.email(instance.demo);
    setBusy(false);
    if (error) setError(authErrorMessage(error, 'Could not sign in'));
    else await signedIn();
  };

  const onPasskey = async () => {
    setError(null);
    const result = await authClient.signIn.passkey();
    if (result?.error)
      setError(authErrorMessage(result.error, 'Passkey sign-in failed'));
    else await signedIn();
  };

  return (
    <AuthCard title={`Sign in to ${instance?.name ?? 'openRun'}`}>
      <FormError message={error} />
      {instance?.demo ? (
        <div className="space-y-3">
          <p className="text-sm text-stone-600 dark:text-stone-400">
            This is a demo. Sign in as Sam, a runner in a run club, and look
            around. Everyone shares this login, and it all resets every night.
          </p>
          <button
            type="button"
            className="btn-primary w-full"
            onClick={onDemo}
            disabled={busy}
          >
            Try the demo
          </button>
        </div>
      ) : (
        <DefaultSignIn
          passwordLogin={instance?.passwordLogin !== false}
          busy={busy}
          onPasskey={onPasskey}
          onSubmit={onSubmit}
        />
      )}
    </AuthCard>
  );
}

function DefaultSignIn({
  passwordLogin,
  busy,
  onPasskey,
  onSubmit,
}: {
  passwordLogin: boolean;
  busy: boolean;
  onPasskey: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <>
      <button type="button" className="btn-primary w-full" onClick={onPasskey}>
        Sign in with a passkey
      </button>
      {passwordLogin && (
        <>
          <div className="flex items-center gap-3 text-xs uppercase text-stone-400">
            <span className="h-px flex-1 bg-stone-200 dark:bg-stone-800" />
            or
            <span className="h-px flex-1 bg-stone-200 dark:bg-stone-800" />
          </div>
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input
                className="input"
                id="email"
                name="email"
                type="email"
                autoComplete="username webauthn"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <input
                className="input"
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            <button className="btn-secondary w-full" disabled={busy}>
              Sign in with password
            </button>
          </form>
        </>
      )}
      <p className="text-center text-sm text-stone-500">
        New here?{' '}
        <Link to="/register" className="font-medium text-brand-600">
          Create an account
        </Link>
      </p>
    </>
  );
}

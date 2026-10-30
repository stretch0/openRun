import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthCard, FormError } from '../components/auth-card';
import { authClient } from '../lib/auth-client';
import { authErrorMessage } from '../lib/auth-errors';
import { useInstance, useMe } from '../lib/queries';

type SignUpInput = Parameters<typeof authClient.signUp.email>[0];

export function RegisterPage() {
  const { data: instance } = useInstance();
  const { data: me } = useMe();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (me) return <Navigate to="/" replace />;
  if (instance?.demo) return <Navigate to="/login" replace />;

  const needsSetup = instance?.needsSetup ?? false;
  const needsInvite = !needsSetup && (instance?.inviteOnly ?? false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const { error } = await authClient.signUp.email({
      name: String(form.get('name')),
      email: String(form.get('email')),
      password: String(form.get('password')),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      // Checked by the server when the instance is invite-only.
      inviteCode: form.get('inviteCode') || undefined,
    } as SignUpInput);
    setBusy(false);
    if (error) {
      setError(authErrorMessage(error, 'Could not create your account'));
      return;
    }
    await queryClient.invalidateQueries();
    navigate('/', { replace: true });
  };

  return (
    <AuthCard title={needsSetup ? 'Set up openRun' : 'Create your account'}>
      {needsSetup && (
        <p className="text-sm text-stone-600 dark:text-stone-400">
          This is a new instance. The first account becomes the administrator.
        </p>
      )}
      {!needsSetup && instance && (
        <p className="rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-600 dark:bg-stone-800 dark:text-stone-300">
          Your runs will be stored on <strong>{instance.name}</strong>
          {instance.contact ? `, run by ${instance.contact}` : ''}. They're
          private to you, but whoever runs a server can read what's stored on
          it.{' '}
          <Link to="/privacy" className="font-medium text-brand-600">
            Who can see what
          </Link>
        </p>
      )}
      <FormError message={error} />
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="label" htmlFor="name">
            Name
          </label>
          <input
            className="input"
            id="name"
            name="name"
            autoComplete="name"
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            className="input"
            id="email"
            name="email"
            type="email"
            autoComplete="email"
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
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        {needsInvite && (
          <div>
            <label className="label" htmlFor="inviteCode">
              Invite code
            </label>
            <input
              className="input"
              id="inviteCode"
              name="inviteCode"
              defaultValue={params.get('invite') ?? ''}
              required
            />
          </div>
        )}
        <button className="btn-primary w-full" disabled={busy}>
          {needsSetup ? 'Create admin account' : 'Create account'}
        </button>
      </form>
      <p className="text-sm text-stone-500">
        You can add a passkey in Settings after signing up.
      </p>
      {!needsSetup && (
        <p className="text-center text-sm text-stone-500">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-600">
            Sign in
          </Link>
        </p>
      )}
    </AuthCard>
  );
}

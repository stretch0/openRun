import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { z } from 'zod';
import { type CreateInvite, inviteSchema } from '@openrun/schemas';
import { api } from '../lib/api';
import { useInstance } from '../lib/queries';

export function AdminPage() {
  const { data: instance } = useInstance();
  const queryClient = useQueryClient();
  const invites = useQuery({
    queryKey: ['admin', 'invites'],
    queryFn: () => api('/admin/invites', z.array(inviteSchema)),
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['admin', 'invites'] });

  const create = useMutation({
    mutationFn: (body: Partial<CreateInvite>) =>
      api('/admin/invites', inviteSchema, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api(`/admin/invites/${id}`, z.undefined(), { method: 'DELETE' }),
    onSuccess: refresh,
  });

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get('email') ?? '');
    create.mutate(email ? { email } : {});
    e.currentTarget.reset();
  };

  return (
    <>
      <h1 className="text-2xl font-semibold">Admin</h1>
      <section className="card space-y-3">
        <h2 className="font-semibold">Invites</h2>
        <p className="text-sm text-stone-500">
          {instance?.inviteOnly
            ? 'This instance is invite-only. New people need an invite link to join.'
            : 'Anyone can sign up to this instance. Set INVITE_ONLY=true to require invites.'}
        </p>
        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            className="input"
            name="email"
            type="email"
            placeholder="Email (optional)"
          />
          <button className="btn-primary shrink-0" disabled={create.isPending}>
            Create invite
          </button>
        </form>
        <ul className="divide-y divide-stone-200 dark:divide-stone-800">
          {invites.data?.map((invite) => (
            <InviteRow
              key={invite.id}
              invite={invite}
              onDelete={() => remove.mutate(invite.id)}
            />
          ))}
        </ul>
      </section>
    </>
  );
}

function InviteRow({
  invite,
  onDelete,
}: {
  invite: z.infer<typeof inviteSchema>;
  onDelete: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/register?invite=${invite.code}`;
  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
  };
  return (
    <li className="flex items-center gap-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono">{invite.code}</p>
        <p className="text-stone-500">
          {invite.usedAt
            ? `Used ${new Date(invite.usedAt).toLocaleDateString()}`
            : `${invite.email ?? 'Anyone'} · expires ${invite.expiresAt ? new Date(invite.expiresAt).toLocaleDateString() : 'never'}`}
        </p>
      </div>
      {!invite.usedAt && (
        <button className="font-medium text-brand-600" onClick={copy}>
          {copied ? 'Copied' : 'Copy link'}
        </button>
      )}
      <button className="text-red-600" onClick={onDelete}>
        Delete
      </button>
    </li>
  );
}

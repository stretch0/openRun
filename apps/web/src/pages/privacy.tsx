import { Link } from 'react-router-dom';
import { useInstance, useMe } from '../lib/queries';

/** "Who can see what": readable before signing up, so it's outside the app layout. */
export function PrivacyPage() {
  const { data: instance } = useInstance();
  const { data: me } = useMe();
  const name = instance?.name ?? 'this instance';

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 pb-16 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <Link
        to={me ? '/settings' : '/register'}
        className="text-sm text-brand-600"
      >
        ← Back
      </Link>
      <h1 className="text-2xl font-semibold">Who can see what</h1>

      <Section title="Your runs">
        <p>
          Every run is private when it arrives. Only you can see it, its map,
          your heart rate, your stats and your shoes.
        </p>
        <p>
          You can change a run to <strong>My clubs</strong>, or set that as the
          default in Settings → Privacy. Even then, a club only gets a run when
          you share it with that club.
        </p>
      </Section>

      <Section title="When you share a run">
        <p>
          Clubs see the distance, time and pace. They only see the route if you
          turn on <strong>Include the map when sharing</strong>, and even then
          the parts inside your privacy zones are cut out.
        </p>
        <p>
          Clubs will only ever celebrate turning up: streaks and milestones,
          never who ran fastest. You choose whether you appear in them.
        </p>
      </Section>

      <Section title="Admins of this instance">
        <p>
          Admins can invite people and change instance settings. They can't see
          your runs, reset your password or sign in as you from inside the app.
        </p>
      </Section>

      <Section title="Whoever runs the server">
        <p>
          Your data is stored on <strong>{name}</strong>. Like any server, the
          person who runs it can read what's stored there. Only use an instance
          run by someone you trust, or run your own: openRun is free and
          self-hosted.
        </p>
        <p>
          If you sync from your watch through intervals.icu, the server keeps
          the access you gave it (a sign-in that can only read your activities,
          or your API key), encrypted. Whoever runs the server could still use
          it to reach your intervals.icu account, but never your Garmin or other
          watch account. Disconnecting removes it.
        </p>
        {instance?.contact && (
          <p>
            Contact for this instance: <strong>{instance.contact}</strong>
          </p>
        )}
      </Section>

      <Section title="Forgotten your password?">
        <p>
          There's no reset by email. Ask whoever runs the server
          {instance?.contact ? ` (${instance.contact})` : ''}: they can set a
          temporary password with a command, which also signs you out
          everywhere. Adding a passkey in Settings means you're unlikely to need
          it.
        </p>
      </Section>

      <Section title="Taking your data with you">
        <p>
          Settings → Export downloads everything as JSON or CSV, and each run's
          original FIT or GPX file can be downloaded from its page.
        </p>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card space-y-2 text-sm leading-relaxed text-stone-700 dark:text-stone-300">
      <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
        {title}
      </h2>
      {children}
    </section>
  );
}

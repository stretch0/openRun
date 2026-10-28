import { useMe } from '../lib/queries';

const upcoming = [
  {
    title: 'Run log',
    body: 'Import FIT and GPX files or add runs by hand, with maps, splits and personal bests.',
  },
  {
    title: 'Run clubs',
    body: 'Schedule club runs, see who is going and put in your coffee order.',
  },
  {
    title: 'Garmin and Strava sync',
    body: 'Pull in your runs automatically and send planned workouts to your watch.',
  },
  {
    title: 'Training plans and AI',
    body: 'Build a plan for your next race and connect AI assistants over MCP.',
  },
];

export function HomePage() {
  const { data: me } = useMe();
  return (
    <>
      <h1 className="text-2xl font-semibold">Hi {me?.name.split(' ')[0]} 👋</h1>
      <section className="card text-center">
        <p className="font-medium">No runs yet</p>
        <p className="mt-1 text-sm text-stone-500">
          Your runs will show up here once run logging lands.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Coming next
        </h2>
        {upcoming.map((item) => (
          <div key={item.title} className="card">
            <p className="font-medium">{item.title}</p>
            <p className="mt-1 text-sm text-stone-500">{item.body}</p>
          </div>
        ))}
      </section>
    </>
  );
}

import { type DragEvent, type FormEvent, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { metresFrom, parseDuration } from '@openrun/domain';
import { type Sport, sportSchema } from '@openrun/schemas';
import { FormError } from '../components/auth-card';
import { ShoeSelect } from '../components/shoe-settings';
import { useCreateActivity, useImportFiles } from '../lib/activities';
import { SPORT_LABELS } from '../lib/format';
import { useMe } from '../lib/queries';

export function AddActivityPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Add a run</h1>
      <ImportFiles />
      <ManualEntry />
    </>
  );
}

const STATUS_TEXT = {
  imported: 'Imported',
  duplicate: 'Already imported',
  failed: 'Failed',
};

function ImportFiles() {
  const importFiles = useImportFiles();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const upload = (files: FileList | null) => {
    if (files?.length) importFiles.mutate(Array.from(files));
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    upload(e.dataTransfer.files);
  };

  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Import files</h2>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-xl border-2 border-dashed p-6 text-center transition ${
          dragging
            ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
            : 'border-stone-300 dark:border-stone-700'
        }`}
      >
        <p className="text-sm text-stone-500">
          FIT or GPX files from your watch or another app. You can pick several
          at once, and gzipped exports (.fit.gz, .gpx.gz) work too.
        </p>
        <input
          ref={input}
          type="file"
          multiple
          accept=".fit,.gpx,.gz,application/gpx+xml"
          className="hidden"
          aria-label="Activity files"
          onChange={(e) => {
            upload(e.target.files);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          className="btn-primary mt-3"
          onClick={() => input.current?.click()}
          disabled={importFiles.isPending}
        >
          {importFiles.isPending ? 'Importing…' : 'Choose files'}
        </button>
      </div>
      <FormError message={importFiles.error?.message} />
      {importFiles.data && (
        <ul
          className="divide-y divide-stone-200 text-sm dark:divide-stone-800"
          aria-label="Import results"
        >
          {importFiles.data.map((r, i) => (
            <li key={i} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate">{r.fileName}</p>
                {r.error && <p className="text-red-600">{r.error}</p>}
              </div>
              <span
                className={
                  r.status === 'failed' ? 'text-red-600' : 'text-stone-500'
                }
              >
                {STATUS_TEXT[r.status]}
              </span>
              {r.activityId && (
                <Link
                  to={`/activities/${r.activityId}`}
                  className="font-medium text-brand-600"
                >
                  View
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The current local time, formatted for a datetime-local input. */
function nowLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset(), 0, 0);
  return d.toISOString().slice(0, 16);
}

function ManualEntry() {
  const { data: me } = useMe();
  const create = useCreateActivity();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const units = me?.units ?? 'metric';

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const field = (name: string) => String(form.get(name) ?? '').trim();
    const optionalNumber = (name: string) =>
      field(name) ? Number(field(name)) : null;

    const durationS = parseDuration(field('duration'));
    if (!durationS) {
      setError('Enter the time as h:mm:ss, mm:ss or minutes');
      return;
    }
    setError(null);
    create.mutate(
      {
        name: field('name'),
        sport: field('sport') as Sport,
        startedAt: new Date(field('startedAt')).toISOString(),
        distanceM: metresFrom(Number(field('distance')), units),
        durationS,
        elevationGainM: optionalNumber('elevation'),
        avgHeartRate: optionalNumber('heartRate'),
        rpe: optionalNumber('rpe'),
        notes: field('notes') || null,
        shoeId: field('shoeId') || null,
      },
      { onSuccess: (a) => navigate(`/activities/${a.id}`) },
    );
  };

  return (
    <form onSubmit={onSubmit} className="card space-y-3">
      <h2 className="font-semibold">Add by hand</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" name="name" required defaultValue="Run" />
        <div>
          <label className="label" htmlFor="sport">
            Type
          </label>
          <select className="input" id="sport" name="sport" defaultValue="run">
            {sportSchema.options.map((s) => (
              <option key={s} value={s}>
                {SPORT_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <Field
          label="Start"
          name="startedAt"
          type="datetime-local"
          required
          defaultValue={nowLocal()}
        />
        <Field
          label={`Distance (${units === 'metric' ? 'km' : 'mi'})`}
          name="distance"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0.01"
          required
        />
        <Field
          label="Time"
          name="duration"
          placeholder="h:mm:ss"
          inputMode="numeric"
          required
        />
        <Field
          label="Elevation gain (m)"
          name="elevation"
          type="number"
          min="0"
        />
        <Field
          label="Average heart rate"
          name="heartRate"
          type="number"
          min="20"
          max="250"
        />
        <Field
          label="Effort (1–10)"
          name="rpe"
          type="number"
          min="1"
          max="10"
        />
        <ShoeSelect />
      </div>
      <div>
        <label className="label" htmlFor="notes">
          Notes
        </label>
        <textarea className="input" id="notes" name="notes" rows={3} />
      </div>
      <FormError message={error ?? create.error?.message} />
      <button className="btn-primary" disabled={create.isPending}>
        Save run
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  ...props
}: {
  label: string;
  name: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <input className="input" id={name} name={name} {...props} />
    </div>
  );
}

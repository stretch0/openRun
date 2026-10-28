import { type FormEvent, useState } from 'react';
import { formatDistance, metresFrom } from '@openrun/domain';
import type { Shoe, Units } from '@openrun/schemas';
import {
  useCreateShoe,
  useDeleteShoe,
  useShoes,
  useUpdateShoe,
} from '../lib/stats';
import { FormError } from './auth-card';

export function ShoeSettings({ units }: { units: Units }) {
  const { data: shoes } = useShoes();
  const create = useCreateShoe();
  const [adding, setAdding] = useState(false);
  const unit = units === 'metric' ? 'km' : 'mi';

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const starting = Number(form.get('starting') || 0);
    create.mutate(
      {
        name: String(form.get('shoeName')),
        brand: String(form.get('brand') ?? '') || null,
        startingDistanceM: metresFrom(starting, units),
      },
      { onSuccess: () => setAdding(false) },
    );
  };

  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Shoes</h2>
      <p className="text-sm text-stone-500">
        Pick a shoe when you log or edit a run to track its distance.
      </p>
      {shoes?.length ? (
        <ul className="divide-y divide-stone-200 dark:divide-stone-800">
          {shoes.map((shoe) => (
            <ShoeRow key={shoe.id} shoe={shoe} units={units} />
          ))}
        </ul>
      ) : null}
      {adding ? (
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="shoeName">
                Name
              </label>
              <input
                className="input"
                id="shoeName"
                name="shoeName"
                placeholder="Pegasus 41"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="brand">
                Brand
              </label>
              <input className="input" id="brand" name="brand" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="starting">
              Distance already on them ({unit})
            </label>
            <input
              className="input"
              id="starting"
              name="starting"
              type="number"
              min="0"
              step="0.1"
              defaultValue="0"
            />
          </div>
          <FormError message={create.error?.message} />
          <div className="flex gap-2">
            <button className="btn-primary" disabled={create.isPending}>
              Add shoes
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          className="btn-secondary w-full"
          onClick={() => setAdding(true)}
        >
          Add shoes
        </button>
      )}
    </section>
  );
}

function ShoeRow({ shoe, units }: { shoe: Shoe; units: Units }) {
  const update = useUpdateShoe();
  const remove = useDeleteShoe();
  const onDelete = () => {
    if (
      window.confirm(
        `Delete “${shoe.name}”? Your runs stay; they just won't be linked to these shoes.`,
      )
    ) {
      remove.mutate(shoe.id);
    }
  };
  return (
    <li className="flex items-center gap-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p
          className={`truncate font-medium ${shoe.retired ? 'text-stone-500' : ''}`}
        >
          {shoe.name}
          {shoe.retired && ' (retired)'}
        </p>
        <p className="text-stone-500">
          {[
            shoe.brand,
            formatDistance(shoe.distanceM, units),
            `${shoe.runCount} runs`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <button
        className="font-medium text-brand-600"
        onClick={() => update.mutate({ id: shoe.id, retired: !shoe.retired })}
      >
        {shoe.retired ? 'Unretire' : 'Retire'}
      </button>
      <button className="text-red-600" onClick={onDelete}>
        Delete
      </button>
    </li>
  );
}

/** A select for the shoe worn on a run: active shoes, plus the current one if retired. */
export function ShoeSelect({ value }: { value?: string | null }) {
  const { data: shoes } = useShoes();
  const options = shoes?.filter((s) => !s.retired || s.id === value) ?? [];
  if (!options.length) return null;
  return (
    <div>
      <label className="label" htmlFor="shoeId">
        Shoes
      </label>
      <select
        className="input"
        id="shoeId"
        name="shoeId"
        defaultValue={value ?? ''}
        // Shoes load after the form; remount so defaultValue applies.
        key={options.length}
      >
        <option value="">None</option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}

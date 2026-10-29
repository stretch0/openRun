import { type FormEvent, type ReactNode, useState } from 'react';
import { describeChoices } from '@openrun/domain';
import type { CoffeeOrder, MenuItem } from '@openrun/schemas';
import { FormError } from './auth-card';

/** "Flat white · Oat, Large". */
export function describeOrder(order: Pick<CoffeeOrder, 'item' | 'choices'>) {
  const choices = describeChoices(order.choices);
  return choices ? `${order.item} · ${choices}` : order.item;
}

export type Picked = {
  menuItemId: string;
  choices: Record<string, string | null>;
};

/** Pick something from the menu and its choices. */
export function CoffeePicker({
  menu,
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
  children,
}: {
  menu: MenuItem[];
  initial?: Pick<CoffeeOrder, 'menuItemId' | 'choices'> | null;
  submitLabel: string;
  pending: boolean;
  error?: string;
  onSubmit: (picked: Picked, form: FormData) => void;
  onCancel: () => void;
  /** Extra fields, such as "make this my usual". */
  children?: ReactNode;
}) {
  const items = menu.filter((i) => !i.hidden);
  const [itemId, setItemId] = useState(
    items.find((i) => i.id === initial?.menuItemId)?.id ?? items[0]?.id,
  );
  const item = items.find((i) => i.id === itemId);
  const initialChoice = (option: string) =>
    initial?.menuItemId === itemId
      ? (initial?.choices.find((c) => c.option === option)?.choice ?? '')
      : '';

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!item) return;
    const form = new FormData(e.currentTarget);
    onSubmit(
      {
        menuItemId: item.id,
        choices: Object.fromEntries(
          item.options.map((o) => [
            o.name,
            String(form.get(`choice-${o.name}`) ?? '') || null,
          ]),
        ),
      },
      form,
    );
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <fieldset className="flex flex-wrap gap-1.5">
        <legend className="sr-only">What would you like?</legend>
        {items.map((i) => (
          <label
            key={i.id}
            className="cursor-pointer rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium has-[:checked]:border-brand-600 has-[:checked]:bg-brand-600 has-[:checked]:text-white dark:border-stone-700"
          >
            <input
              type="radio"
              name="item"
              value={i.id}
              checked={i.id === itemId}
              onChange={() => setItemId(i.id)}
              className="sr-only"
            />
            {i.name}
          </label>
        ))}
      </fieldset>
      {item && item.options.length > 0 && (
        <div className="grid grid-cols-2 gap-3" key={item.id}>
          {item.options.map((o) => (
            <div key={o.name}>
              <label className="label" htmlFor={`choice-${o.name}`}>
                {o.name}
              </label>
              <select
                className="input"
                id={`choice-${o.name}`}
                name={`choice-${o.name}`}
                defaultValue={initialChoice(o.name)}
              >
                <option value="">No preference</option>
                {o.choices.map((choice) => (
                  <option key={choice}>{choice}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
      {children}
      <FormError message={error} />
      <div className="flex gap-2">
        <button className="btn-primary" disabled={!item || pending}>
          {submitLabel}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

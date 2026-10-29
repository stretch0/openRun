/** A choice on a menu item, e.g. milk: whole, oat or soy. */
export type MenuOption = { name: string; choices: string[] };

/** One choice someone made, e.g. { option: 'Milk', choice: 'Oat' }. */
export type OrderChoice = { option: string; choice: string };

/**
 * Reads options written one per line, as "Milk: Whole, Oat, Soy".
 * Blank lines are skipped; a line without choices is ignored.
 */
export function parseMenuOptions(text: string): MenuOption[] {
  const options: MenuOption[] = [];
  for (const line of text.split('\n')) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const name = line.slice(0, colon).trim();
    const choices = [
      ...new Set(
        line
          .slice(colon + 1)
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean),
      ),
    ];
    if (name && choices.length) options.push({ name, choices });
  }
  return options;
}

export function formatMenuOptions(options: MenuOption[]): string {
  return options.map((o) => `${o.name}: ${o.choices.join(', ')}`).join('\n');
}

/**
 * Checks picked choices against an item's options and puts them in menu
 * order. Every option is optional. Returns null if a pick isn't on the menu.
 */
export function resolveChoices(
  options: MenuOption[],
  picked: Record<string, string | null | undefined>,
): OrderChoice[] | null {
  const names = new Set(options.map((o) => o.name));
  if (Object.keys(picked).some((name) => picked[name] && !names.has(name))) {
    return null;
  }
  const resolved: OrderChoice[] = [];
  for (const option of options) {
    const choice = picked[option.name];
    if (!choice) continue;
    if (!option.choices.includes(choice)) return null;
    resolved.push({ option: option.name, choice });
  }
  return resolved;
}

/** "Oat, Large", or "" when nothing was chosen. */
export function describeChoices(choices: OrderChoice[]): string {
  return choices.map((c) => c.choice).join(', ');
}

/** When orders lock: `cutoffMinutes` before the run starts. */
export function ordersCloseAt(startsAt: Date, cutoffMinutes: number): Date {
  return new Date(startsAt.getTime() - cutoffMinutes * 60_000);
}

export type PlacedOrder = {
  name: string;
  item: string;
  choices: OrderChoice[];
};

export type OrderSummary = {
  total: number;
  /** One line per item, most ordered first, split by the choices made. */
  lines: {
    item: string;
    count: number;
    variants: { choices: string; count: number }[];
  }[];
  /** Who's having what, by name, for handing the drinks out. */
  people: { name: string; item: string; choices: string }[];
};

const byCountThenName =
  <T extends { count: number }>(name: (t: T) => string) =>
  (a: T, b: T) =>
    b.count - a.count || name(a).localeCompare(name(b));

/** What to ask for at the counter: counts by item and by choices. */
export function summariseOrders(orders: PlacedOrder[]): OrderSummary {
  const items = new Map<string, Map<string, number>>();
  for (const order of orders) {
    const variants = items.get(order.item) ?? new Map<string, number>();
    const key = describeChoices(order.choices);
    variants.set(key, (variants.get(key) ?? 0) + 1);
    items.set(order.item, variants);
  }
  const lines = [...items].map(([item, variants]) => ({
    item,
    count: [...variants.values()].reduce((a, b) => a + b, 0),
    variants: [...variants]
      .map(([choices, count]) => ({ choices, count }))
      .sort(byCountThenName((v) => v.choices)),
  }));
  return {
    total: orders.length,
    lines: lines.sort(byCountThenName((l) => l.item)),
    people: orders
      .map((o) => ({
        name: o.name,
        item: o.item,
        choices: describeChoices(o.choices),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

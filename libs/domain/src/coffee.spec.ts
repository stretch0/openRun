import {
  describeChoices,
  formatMenuOptions,
  ordersCloseAt,
  parseMenuOptions,
  resolveChoices,
  summariseOrders,
} from './coffee.js';

const options = [
  { name: 'Milk', choices: ['Whole', 'Oat', 'Soy'] },
  { name: 'Size', choices: ['Regular', 'Large'] },
];

describe('menu options', () => {
  it('reads one option per line', () => {
    expect(
      parseMenuOptions(
        'Milk: Whole, Oat,Soy, Oat\n\nnot an option\nSize:Regular, Large\nEmpty:',
      ),
    ).toEqual(options);
    expect(parseMenuOptions('')).toEqual([]);
  });

  it('writes them back the same way', () => {
    expect(parseMenuOptions(formatMenuOptions(options))).toEqual(options);
  });
});

describe('resolveChoices', () => {
  it('puts picks in menu order and skips options left blank', () => {
    expect(resolveChoices(options, { Size: 'Large', Milk: 'Oat' })).toEqual([
      { option: 'Milk', choice: 'Oat' },
      { option: 'Size', choice: 'Large' },
    ]);
    expect(resolveChoices(options, { Milk: '', Size: null })).toEqual([]);
  });

  it('rejects anything not on the menu', () => {
    expect(resolveChoices(options, { Milk: 'Goat' })).toBeNull();
    expect(resolveChoices(options, { Sugar: 'Two' })).toBeNull();
  });
});

describe('orders', () => {
  it('closes the chosen number of minutes before the start', () => {
    const start = new Date('2026-10-31T08:00:00Z');
    expect(ordersCloseAt(start, 0)).toEqual(start);
    expect(ordersCloseAt(start, 30).toISOString()).toBe(
      '2026-10-31T07:30:00.000Z',
    );
  });

  it('sums up what to ask for at the counter', () => {
    const oatLarge = [
      { option: 'Milk', choice: 'Oat' },
      { option: 'Size', choice: 'Large' },
    ];
    const summary = summariseOrders([
      { name: 'Cal', item: 'Flat white', choices: oatLarge },
      { name: 'Ann', item: 'Tea', choices: [] },
      { name: 'Bea', item: 'Flat white', choices: [] },
      { name: 'Dee', item: 'Flat white', choices: oatLarge },
    ]);
    expect(summary).toEqual({
      total: 4,
      lines: [
        {
          item: 'Flat white',
          count: 3,
          variants: [
            { choices: 'Oat, Large', count: 2 },
            { choices: '', count: 1 },
          ],
        },
        { item: 'Tea', count: 1, variants: [{ choices: '', count: 1 }] },
      ],
      people: [
        { name: 'Ann', item: 'Tea', choices: '' },
        { name: 'Bea', item: 'Flat white', choices: '' },
        { name: 'Cal', item: 'Flat white', choices: 'Oat, Large' },
        { name: 'Dee', item: 'Flat white', choices: 'Oat, Large' },
      ],
    });
    expect(describeChoices(oatLarge)).toBe('Oat, Large');
    expect(summariseOrders([])).toEqual({ total: 0, lines: [], people: [] });
  });
});

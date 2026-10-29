import {
  clubRunDetailSchema,
  clubSchema,
  menuItemSchema,
  orderSummarySchema,
  runCoffeeSchema,
} from '@openrun/schemas';
import { type App, get, send, setup, signUp } from '../test-utils.js';

const HOUR = 3_600_000;

async function json<T>(res: Response, schema: { parse: (v: unknown) => T }) {
  expect(res.status).toBeLessThan(300);
  return schema.parse(await res.json());
}

/** A club with an owner, a member (Ann) and a menu. */
async function clubWithMenu() {
  const { app } = setup();
  const owner = (await signUp(app, 'owner@example.com')).cookie;
  const ann = (await signUp(app, 'ann@example.com')).cookie;
  const club = await json(
    await send(app, owner, 'POST', '/api/clubs', {
      name: 'Parkside Runners',
      timezone: 'Europe/London',
    }),
    clubSchema,
  );
  await send(app, ann, 'POST', '/api/clubs/join', { code: club.joinCode });
  const flatWhite = await json(
    await send(app, owner, 'POST', `/api/clubs/${club.id}/menu`, {
      name: 'Flat white',
      options: [
        { name: 'Milk', choices: ['Whole', 'Oat'] },
        { name: 'Size', choices: ['Regular', 'Large'] },
      ],
    }),
    menuItemSchema,
  );
  const tea = await json(
    await send(app, owner, 'POST', `/api/clubs/${club.id}/menu`, {
      name: 'Tea',
    }),
    menuItemSchema,
  );
  return { app, owner, ann, club, flatWhite, tea };
}

async function addRun(
  app: App,
  cookie: string,
  clubId: string,
  inMs: number,
  orderCutoffMin = 30,
) {
  return json(
    await send(app, cookie, 'POST', `/api/clubs/${clubId}/runs`, {
      title: 'Social',
      startsAt: new Date(Date.now() + inMs).toISOString(),
      orderCutoffMin,
    }),
    clubRunDetailSchema,
  );
}

describe('coffee', () => {
  it('lets organisers keep a menu, hiding rather than deleting', async () => {
    const { app, owner, ann, club, tea } = await clubWithMenu();
    expect(
      (
        await send(app, ann, 'POST', `/api/clubs/${club.id}/menu`, {
          name: 'Cake',
        })
      ).status,
    ).toBe(403);

    // Hiding keeps the options: edits only change what was sent.
    await send(app, owner, 'PATCH', `/api/clubs/${club.id}/menu/${tea.id}`, {
      hidden: true,
    });
    const asOwner = await json(
      await get(app, `/api/clubs/${club.id}`, owner),
      clubSchema,
    );
    const asAnn = await json(
      await get(app, `/api/clubs/${club.id}`, ann),
      clubSchema,
    );
    expect(asOwner.menu.map((i) => [i.name, i.hidden])).toEqual([
      ['Flat white', false],
      ['Tea', true],
    ]);
    expect(asOwner.menu[0].options).toHaveLength(2);
    expect(asAnn.menu.map((i) => i.name)).toEqual(['Flat white']);
  });

  it('takes orders from people who are going, until orders close', async () => {
    const { app, owner, ann, club, flatWhite, tea } = await clubWithMenu();
    const run = await addRun(app, owner, club.id, 48 * HOUR);
    expect(run.coffee).toMatchObject({ open: true, orderCount: 0 });
    const orderPath = `/api/clubs/${club.id}/runs/${run.id}/order`;
    const order = {
      menuItemId: flatWhite.id,
      choices: { Size: 'Large', Milk: 'Oat' },
    };

    const notGoing = await send(app, ann, 'PUT', orderPath, order);
    expect(notGoing.status).toBe(400);
    expect(await notGoing.json()).toEqual({ error: 'Say you’re going first' });

    await send(app, ann, 'PUT', `/api/clubs/${club.id}/runs/${run.id}/rsvp`, {
      status: 'going',
    });
    expect(
      (
        await send(app, ann, 'PUT', orderPath, {
          ...order,
          choices: { Milk: 'Goat' },
        })
      ).status,
    ).toBe(400);
    const placed = await json(
      await send(app, ann, 'PUT', orderPath, { ...order, saveAsUsual: true }),
      runCoffeeSchema,
    );
    expect(placed).toMatchObject({
      orderCount: 1,
      myOrder: {
        item: 'Flat white',
        choices: [
          { option: 'Milk', choice: 'Oat' },
          { option: 'Size', choice: 'Large' },
        ],
      },
    });
    expect(
      (await json(await get(app, `/api/clubs/${club.id}`, ann), clubSchema))
        .myUsual,
    ).toMatchObject({ item: 'Flat white', autoAdd: false });

    // The owner orders too, then the cashier summary adds them up.
    await send(app, owner, 'PUT', `/api/clubs/${club.id}/runs/${run.id}/rsvp`, {
      status: 'going',
    });
    await send(app, owner, 'PUT', orderPath, { menuItemId: tea.id });
    const summary = await json(
      await get(app, `/api/clubs/${club.id}/runs/${run.id}/orders`, ann),
      orderSummarySchema,
    );
    expect(summary).toMatchObject({
      runTitle: 'Social',
      open: true,
      total: 2,
      lines: [
        {
          item: 'Flat white',
          count: 1,
          variants: [{ choices: 'Oat, Large', count: 1 }],
        },
        { item: 'Tea', count: 1 },
      ],
      people: [
        { name: 'ann', item: 'Flat white', choices: 'Oat, Large' },
        { name: 'owner', item: 'Tea', choices: '' },
      ],
    });

    // Renaming the item later doesn't rewrite orders already placed.
    await send(
      app,
      owner,
      'PATCH',
      `/api/clubs/${club.id}/menu/${flatWhite.id}`,
      { name: 'Flat white (8oz)' },
    );
    // Not coming any more: the order goes too.
    const maybe = await json(
      await send(app, ann, 'PUT', `/api/clubs/${club.id}/runs/${run.id}/rsvp`, {
        status: 'maybe',
      }),
      clubRunDetailSchema,
    );
    expect(maybe.coffee).toMatchObject({ orderCount: 1, myOrder: null });

    // Orders close 30 minutes before a run.
    const soon = await addRun(app, owner, club.id, 20 * 60_000);
    expect(soon.coffee?.open).toBe(false);
    await send(app, ann, 'PUT', `/api/clubs/${club.id}/runs/${soon.id}/rsvp`, {
      status: 'going',
    });
    const late = await send(
      app,
      ann,
      'PUT',
      `/api/clubs/${club.id}/runs/${soon.id}/order`,
      order,
    );
    expect(await late.json()).toEqual({
      error: 'Orders for this run have closed',
    });
  });

  it('orders your usual when you say you’re going, if you ask it to', async () => {
    const { app, owner, ann, club, flatWhite } = await clubWithMenu();
    const usual = await send(app, ann, 'PUT', `/api/clubs/${club.id}/usual`, {
      menuItemId: flatWhite.id,
      choices: { Milk: 'Oat' },
      autoAdd: true,
    });
    expect(usual.status).toBe(200);
    const run = await addRun(app, owner, club.id, 48 * HOUR);
    const going = await json(
      await send(app, ann, 'PUT', `/api/clubs/${club.id}/runs/${run.id}/rsvp`, {
        status: 'going',
      }),
      clubRunDetailSchema,
    );
    expect(going.coffee?.myOrder).toMatchObject({
      item: 'Flat white',
      choices: [{ option: 'Milk', choice: 'Oat' }],
    });

    // Not once orders have closed.
    const soon = await addRun(app, owner, club.id, 10 * 60_000);
    const late = await json(
      await send(
        app,
        ann,
        'PUT',
        `/api/clubs/${club.id}/runs/${soon.id}/rsvp`,
        { status: 'going' },
      ),
      clubRunDetailSchema,
    );
    expect(late.coffee?.myOrder).toBeNull();
  });

  it('keeps orders inside the club, and removes them when someone leaves', async () => {
    const { app, owner, ann, club, flatWhite } = await clubWithMenu();
    const outsider = (await signUp(app, 'zed@example.com')).cookie;
    const run = await addRun(app, owner, club.id, 48 * HOUR);
    await send(app, ann, 'PUT', `/api/clubs/${club.id}/runs/${run.id}/rsvp`, {
      status: 'going',
    });
    await send(app, ann, 'PUT', `/api/clubs/${club.id}/runs/${run.id}/order`, {
      menuItemId: flatWhite.id,
      saveAsUsual: true,
    });
    const summaryPath = `/api/clubs/${club.id}/runs/${run.id}/orders`;
    expect((await get(app, summaryPath, outsider)).status).toBe(404);

    await send(app, ann, 'DELETE', `/api/clubs/${club.id}/members/me`);
    const summary = await json(
      await get(app, summaryPath, owner),
      orderSummarySchema,
    );
    expect(summary.total).toBe(0);
    // Rejoining starts afresh: no usual left behind.
    await send(app, ann, 'POST', '/api/clubs/join', { code: club.joinCode });
    expect(
      (await json(await get(app, `/api/clubs/${club.id}`, ann), clubSchema))
        .myUsual,
    ).toBeNull();
  });
});

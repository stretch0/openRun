import { afterEach, describe, expect, it, vi } from 'vitest';
import { get, json, setup, signUp } from './test-utils.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubGeocoder(body: unknown, status = 200) {
  const fetch = vi.fn(async () => Response.json(body, { status }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('place search', () => {
  it('needs a signed-in user', async () => {
    const { app } = setup();
    expect((await get(app, '/api/places?q=park')).status).toBe(401);
  });

  it('asks the geocoder from the server and caches the answer', async () => {
    const { app } = setup();
    const { cookie } = await signUp(app, 'ann@example.com');
    const fetch = stubGeocoder([
      {
        name: 'Victoria Park',
        display_name: 'Victoria Park, London, E9, United Kingdom',
        lat: '51.536',
        lon: '-0.039',
      },
      {
        name: '',
        display_name: 'Bandstand, Victoria Park',
        lat: '1',
        lon: '2',
      },
    ]);

    const path = '/api/places?q=victoria%20park&lat=51.5&lng=-0.1';
    const res = await get(app, path, cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      {
        name: 'Victoria Park',
        address: 'Victoria Park, London, E9, United Kingdom',
        lat: 51.536,
        lng: -0.039,
      },
      {
        name: 'Bandstand',
        address: 'Bandstand, Victoria Park',
        lat: 1,
        lng: 2,
      },
    ]);

    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.searchParams.get('q')).toBe('victoria park');
    expect(url.searchParams.get('viewbox')).toBe(
      '-0.4000,51.8000,0.2000,51.2000',
    );
    expect(new Headers(init.headers).get('user-agent')).toMatch(/^openRun\//);
    // Nothing about the member is sent: no cookies or name.
    expect(url.toString()).not.toContain('ann');

    await get(app, path, cookie);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reports a failing geocoder', async () => {
    const { app } = setup();
    const { cookie } = await signUp(app, 'ann@example.com');
    stubGeocoder({ error: 'busy' }, 503);
    const res = await get(app, '/api/places?q=somewhere%20else', cookie);
    expect(res.status).toBe(502);
    expect(await json(res)).toEqual({
      error: "Place search isn't available right now",
    });
  });

  it('can be turned off', async () => {
    const { app } = setup({ PLACE_SEARCH_URL: '' });
    const { cookie } = await signUp(app, 'ann@example.com');
    const fetch = stubGeocoder([]);
    expect((await get(app, '/api/places?q=park', cookie)).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
    expect(await json(await get(app, '/api/instance'))).toMatchObject({
      placeSearch: false,
    });
  });
});

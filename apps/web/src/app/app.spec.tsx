import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import App from './app';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, () => undefined],
    updateServiceWorker: () => undefined,
  }),
}));

function respond(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

describe('App', () => {
  it('sends a new instance to admin setup', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.endsWith('/api/instance')
          ? respond({
              name: 'openRun',
              version: '0.0.1',
              inviteOnly: false,
              passwordLogin: true,
              contact: null,
              placeSearch: true,
              demo: null,
              needsSetup: true,
            })
          : respond({ error: 'Unauthorized' }, 401),
      ),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Set up openRun')).toBeTruthy();
  });
});

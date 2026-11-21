import type { dummyApi as DummyApi } from './dummy-api';

let api: typeof DummyApi;
let playhouse: string;
beforeEach(async () => {
  vi.resetModules();
  history.replaceState({}, '', '/rooms');
  api = (await import('./dummy-api')).dummyApi;
  playhouse = await api.getCachedPlayhouse();
});
afterEach(() => history.replaceState({}, '', '/rooms'));

it('simulates a session failure and a forced list retry', async () => {
  history.replaceState({}, '', '/rooms?failure=session');
  await expect(api.listPlayrooms({ Playhouse: playhouse })).rejects.toThrow('session not active');
  await expect(
    api.listPlayrooms({ Playhouse: playhouse, ForceInstall: true }),
  ).resolves.not.toHaveLength(0);
});

it('simulates an outdated room failure and its update', async () => {
  history.replaceState({}, '', '/rooms?failure=outdated');
  const input = { Name: 'review-payments', Playhouse: playhouse };
  await expect(api.startPlayroom('start', input)).rejects.toThrow(
    'missing the latest security hardening',
  );
  await api.updatePlayroom('update', input);
  const rooms = await api.listPlayrooms({ Playhouse: playhouse });
  expect(rooms.find((room) => room.Name === input.Name)?.Outdated).toBe(false);
});

it('simulates a privileged image failure without losing the ability to create', async () => {
  history.replaceState({}, '', '/rooms?failure=privileged');
  const input = { Name: 'fix-demo', Playhouse: playhouse, Image: 'opencode' };
  await expect(api.createPlayroom('create', input)).rejects.toThrow(
    'requires a privileged playroom',
  );
  await api.createPlayroom('retry', { ...input, Privileged: true });
  expect(
    (await api.listPlayrooms({ Playhouse: playhouse })).some((room) => room.Name === input.Name),
  ).toBe(true);
});

it('previews and simulates allow-current-ip without contacting a real backend', async () => {
  const input = { Name: playhouse, AllowCurrentIP: true };
  expect(await api.previewUpdatePlayhouse(input)).toContain('--allow-current-ip');
  await expect(api.updatePlayhouse('allow-ip', input)).resolves.toBeUndefined();
  await expect(
    api.connectPlayroom({ Name: 'api-development', Playhouse: playhouse, Via: 'nodeport' }),
  ).resolves.toBeUndefined();
});

describe('Dummy environment presence', () => {
  it('simulates login-shell presence without exposing any values', async () => {
    const entries = ['DEMO_API_KEY', 'MISSING_KEY', 'INLINE=example'];
    expect(await api.getEnvironmentPresence(entries, false)).toEqual([
      { Key: 'DEMO_API_KEY', Set: false },
      { Key: 'MISSING_KEY', Set: false },
    ]);
    expect(await api.getEnvironmentPresence(entries, true)).toEqual([
      { Key: 'DEMO_API_KEY', Set: true },
      { Key: 'MISSING_KEY', Set: false },
    ]);
  });
});

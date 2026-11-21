import { dummyApi } from './dummy-api';

describe('Dummy environment presence', () => {
  it('simulates login-shell presence without exposing any values', async () => {
    const entries = ['DEMO_API_KEY', 'MISSING_KEY', 'INLINE=example'];
    expect(await dummyApi.getEnvironmentPresence(entries, false)).toEqual([
      { Key: 'DEMO_API_KEY', Set: false },
      { Key: 'MISSING_KEY', Set: false },
    ]);
    expect(await dummyApi.getEnvironmentPresence(entries, true)).toEqual([
      { Key: 'DEMO_API_KEY', Set: true },
      { Key: 'MISSING_KEY', Set: false },
    ]);
  });
});

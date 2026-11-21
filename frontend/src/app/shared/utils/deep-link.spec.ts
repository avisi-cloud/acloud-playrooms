import { parseDeepLink, roomDeepLink } from './deep-link';

describe('Deep links', () => {
  it.each(['rooms', 'connect'] as const)('parses %s links and decodes each name once', (action) => {
    expect(parseDeepLink(`acloud-playrooms://${action}/demo%2Dhouse/demo%252Droom`)).toEqual({
      action,
      playhouse: 'demo-house',
      room: 'demo%2Droom',
    });
  });

  it.each(['create?', 'create/?'])('parses %s with an encoded playhouse', (path) => {
    expect(parseDeepLink(`acloud-playrooms://${path}playhouse=demo%2Dhouse`)).toEqual({
      action: 'create',
      playhouse: 'demo-house',
    });
  });

  it('copies a room link with encoded names', () => {
    expect(roomDeepLink('demo-house', 'demo%room')).toBe(
      'acloud-playrooms://rooms/demo-house/demo%25room',
    );
    expect(parseDeepLink(roomDeepLink('demo-house', 'demo%room'))).toEqual({
      action: 'rooms',
      playhouse: 'demo-house',
      room: 'demo%room',
    });
  });

  it.each([
    'https://rooms/ph/demo',
    'acloud-playrooms://delete/ph/demo',
    'acloud-playrooms://rooms/ph',
    'acloud-playrooms://rooms//demo',
    'acloud-playrooms://rooms/ph/demo/extra',
    'acloud-playrooms://rooms/ph/demo?force=true',
    'acloud-playrooms://rooms/ph/demo#connect',
    'acloud-playrooms://rooms/ph/%ZZ',
    'acloud-playrooms://rooms/ph/%2Fdemo',
    'acloud-playrooms://rooms/ph/%5Cdemo',
    'acloud-playrooms://rooms/ph/%00demo',
    'acloud-playrooms://rooms/ph/..',
    'acloud-playrooms://create',
    'acloud-playrooms://create?playhouse=',
    'acloud-playrooms://create?playhouse=ph&playhouse=other',
    'acloud-playrooms://create?playhouse=ph&force=true',
    'acloud-playrooms://create?context=other&playhouse=ph',
  ])('refuses unsupported or malformed links: %s', (url) => {
    expect(() => parseDeepLink(url)).toThrow();
  });
});

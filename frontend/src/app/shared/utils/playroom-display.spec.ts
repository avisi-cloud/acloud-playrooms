import { listingToRoom } from './playroom-mappers';
import { forwardedPortUrl, hasTailnetHost, sshAlias } from './playroom-display';

describe('room connection shortcuts', () => {
  it('uses one SSH alias rule for every room name', () => {
    expect(sshAlias('api-development')).toBe('playroom-api-development');
  });

  it('links only reported tailnet hosts using the exposed port', () => {
    const room = listingToRoom({ SSHHost: 'demo.example.ts.net' }, 'ph');
    expect(hasTailnetHost(room)).toBe(true);
    expect(forwardedPortUrl(room, 80)).toBe('http://demo.example.ts.net:80');
    for (const port of [0, -1, 65536, 1.5]) expect(forwardedPortUrl(room, port)).toBe('');
    for (const host of [
      '',
      '127.0.0.1:30022',
      'demo.example.test',
      'demo.ts.net.evil.test',
      'https://demo.ts.net',
      'demo.ts.net/path',
    ]) {
      expect(forwardedPortUrl({ ...room, host }, 3000)).toBe('');
    }
  });
});

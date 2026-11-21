import { describeRoomAsText } from './describe-room';
import { listingToRoom } from './playroom-mappers';

describe('describeRoomAsText', () => {
  it('exports reported configuration and both versions as plain text', () => {
    const room = listingToRoom(
      {
        Name: 'demo',
        Image: 'opencode',
        Status: 'Ready',
        SSHHost: 'demo.example.ts.net',
        CPURequest: '500m',
        CPULimit: '4',
        MemRequest: '2Gi',
        MemLimit: '4Gi',
        DiskSize: '20Gi',
        DiskType: 'persistent',
        Ports: [{ Port: 80, TargetPort: 8080 }],
      },
      'ph',
    );
    expect(describeRoomAsText(room, { app: '0.29.1', acloud: '0.40.0' })).toBe(
      [
        'Name: demo',
        'Playhouse: ph',
        'Image: opencode',
        'Size: CPU reserved 500m, limit 4; memory reserved 2Gi, limit 4Gi',
        'Storage: 20Gi (persistent)',
        'Exposure: tailscale',
        'Ports: 80 → 8080',
        'Status: Ready',
        'App version: 0.29.1',
        'Acloud version: 0.40.0',
      ].join('\n'),
    );
  });

  it('keeps unavailable facts unknown and distinguishes no ports from unreported ports', () => {
    const room = listingToRoom({}, 'ph');
    const text = describeRoomAsText(room, { app: '', acloud: '' });
    expect(text).toContain('Exposure: Not reported');
    expect(text).toContain('Ports: Not reported');
    expect(text).toContain('App version: Not reported');
    expect(text).toContain('Acloud version: Not reported');
    expect(describeRoomAsText({ ...room, portForwards: [] }, { app: '', acloud: '' })).toContain(
      'Ports: None',
    );
  });
});

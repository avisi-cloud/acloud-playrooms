import type { HealthCheck } from '../../../../core/services/wails-api';
import { listingToRoom } from '../../../../shared/utils';
import { describeHealthChecks, tailscaleUseInPlayhouse } from './health-check-results';

describe('Tailscale use in the selected playhouse', () => {
  const tailnet = listingToRoom({ Name: 'a', SSHHost: 'a.example.ts.net' }, 'ph');
  const nodePort = listingToRoom({ Name: 'b', SSHHost: '203.0.113.5:30022' }, 'ph');
  const stopped = listingToRoom({ Name: 'c', SSHHost: '' }, 'ph');

  it('counts a reported tailnet host as proof', () => {
    expect(tailscaleUseInPlayhouse('ph', 'ph', [nodePort, tailnet])).toBe('used');
  });

  it('says not used only when rooms report other hosts', () => {
    expect(tailscaleUseInPlayhouse('ph', 'ph', [nodePort, stopped])).toBe('not-used');
  });

  it('leaves it not reported without hosts, rooms or a matching listing', () => {
    expect(tailscaleUseInPlayhouse('ph', 'ph', [stopped])).toBe('not-reported');
    expect(tailscaleUseInPlayhouse('ph', 'ph', [])).toBe('not-reported');
    expect(tailscaleUseInPlayhouse('ph', 'other', [nodePort])).toBe('not-reported');
    expect(tailscaleUseInPlayhouse('', null, [])).toBe('not-reported');
  });
});

describe('copied health check results', () => {
  const check = (fields: Partial<HealthCheck>): HealthCheck =>
    ({
      Key: 'acloud',
      Name: 'acloud',
      Status: 'passed',
      Explanation: '',
      Fix: '',
      Command: '',
      Action: '',
      ...fields,
    }) as HealthCheck;

  it('lists every check with its fix and command', () => {
    expect(
      describeHealthChecks(
        [
          check({ Explanation: 'acloud 0.40.0 at /bin/acloud.' }),
          check({
            Key: 'editor',
            Name: 'Editor',
            Status: 'failed',
            Explanation: 'No extension.',
            Fix: 'Install it.',
            Command: 'code --install-extension x',
          }),
        ],
        '1.2.3',
      ),
    ).toBe(
      [
        'Acloud Playrooms health check (app 1.2.3)',
        '[passed] acloud: acloud 0.40.0 at /bin/acloud.',
        '[failed] Editor: No extension.',
        '  Fix: Install it.',
        '  Command: code --install-extension x',
      ].join('\n'),
    );
  });

  it('says the app version is not reported when it could not be read', () => {
    expect(describeHealthChecks([], '')).toBe('Acloud Playrooms health check (app Not reported)');
  });
});

import { listingToRoom } from './playroom-mappers';
import {
  describeRequestedResourceParts,
  describeRequestedResources,
  describeUnknownRequests,
  parseResourceQuantity,
  totalRequestedResources,
} from './requested-resources';

describe('parseResourceQuantity', () => {
  for (const [quantity, expected] of [
    ['250m', 0.25],
    ['2', 2],
    ['0', 0],
    ['0m', 0],
    [' 2Gi ', 2 * 1024 ** 3],
    ['512Mi', 512 * 1024 ** 2],
    ['1Ki', 1024],
    ['1Ti', 1024 ** 4],
    ['1Pi', 1024 ** 5],
    ['1Ei', 1024 ** 6],
    ['1k', 1e3],
    ['2M', 2e6],
    ['2G', 2e9],
    ['1T', 1e12],
    ['1P', 1e15],
    ['1E', 1e18],
    ['1n', 1e-9],
    ['1u', 1e-6],
    ['.5', 0.5],
    ['+2.', 2],
    ['2e3', 2000],
    ['2E+3', 2000],
    ['2e-3', 0.002],
  ] as const) {
    it(`parses ${quantity} in base units`, () => {
      expect(parseResourceQuantity(quantity)).toBe(expected);
    });
  }

  for (const quantity of [
    '',
    'none',
    'Not reported',
    '-1',
    '-2Gi',
    'NaN',
    'Infinity',
    '2GiB',
    '2gi',
    '1K',
    '2 GB',
    '1e999',
    '1e-999',
    '1.2.3',
    '0x10',
  ]) {
    it(`keeps ${JSON.stringify(quantity)} unknown`, () => {
      expect(parseResourceQuantity(quantity)).toBeNull();
    });
  }
});

describe('requested resource totals', () => {
  it('adds requests and disk allocation across statuses and units, ignoring limits', () => {
    const rooms = [
      listingToRoom(
        {
          CPURequest: '250m',
          CPULimit: '100',
          MemRequest: '512Mi',
          DiskSize: '2Gi',
          Status: 'Stopped',
        },
        'playhouse-a',
      ),
      listingToRoom(
        { CPURequest: '2', MemRequest: '1Gi', DiskSize: '1073741824', Status: 'Ready' },
        'playhouse-a',
      ),
    ];
    const resources = totalRequestedResources(rooms);
    expect(describeRequestedResources(resources)).toBe('2.25 CPU · 1.5 GiB memory · 3 GiB storage');
    expect(describeUnknownRequests(resources)).toEqual([]);
    expect(rooms[0].cpuReq).toBe('250m');
  });

  it('counts each missing or unreadable request separately without treating it as zero', () => {
    const rooms = [
      listingToRoom({}, 'playhouse-a'),
      listingToRoom({ CPURequest: 'none', MemRequest: '1Gi', DiskSize: 'invalid' }, 'playhouse-a'),
      listingToRoom({ CPURequest: '0', MemRequest: '-2Gi', DiskSize: '0' }, 'playhouse-a'),
    ];
    const resources = totalRequestedResources(rooms);
    expect(resources.cpu).toEqual({ total: 0, reported: 1, unknown: 2 });
    expect(describeRequestedResources(resources)).toBe('0 CPU · 1 GiB memory · 0 GiB storage');
    expect(describeUnknownRequests(resources)).toEqual([
      '2 rooms without a CPU request',
      '2 rooms without a memory request',
      '2 rooms without a storage request',
    ]);
    expect(describeUnknownRequests(totalRequestedResources([rooms[0]]))[0]).toBe(
      '1 room without a CPU request',
    );
    expect(describeRequestedResources(totalRequestedResources([rooms[0]]))).toContain(
      'CPU: Not reported',
    );
  });

  it('shortens labels and rounds to 2 decimals in the compact format, unless that hides a request', () => {
    const rooms = [
      listingToRoom({ CPURequest: '333m', MemRequest: '100Mi', DiskSize: '20Gi' }, 'playhouse-a'),
    ];
    const resources = totalRequestedResources(rooms);
    expect(describeRequestedResources(resources, 'compact')).toBe('0.33 CPU · 0.1 GiB · 20 GiB');
    expect(describeRequestedResourceParts(resources, 'full')).toEqual([
      '0.333 CPU',
      '0.09765625 GiB memory',
      '20 GiB storage',
    ]);
    expect(
      describeRequestedResources(
        totalRequestedResources([
          listingToRoom({ CPURequest: '1m', MemRequest: '1Ki' }, 'playhouse-a'),
        ]),
        'compact',
      ),
    ).toBe('0.001 CPU · 9.53674316e-7 GiB · Storage: Not reported');
  });

  it('reports zero for an empty list and preserves very small known requests', () => {
    expect(describeRequestedResources(totalRequestedResources([]))).toBe(
      '0 CPU · 0 GiB memory · 0 GiB storage',
    );
    expect(
      describeRequestedResources(
        totalRequestedResources([
          listingToRoom({ CPURequest: '1n', MemRequest: '1', DiskSize: '1' }, 'playhouse-a'),
        ]),
      ),
    ).toBe('1e-9 CPU · 9.31322575e-10 GiB memory · 9.31322575e-10 GiB storage');
  });
});

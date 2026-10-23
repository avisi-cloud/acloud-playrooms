import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { vi } from 'vitest';
import { CliConsoleService } from './cli-console';
import { PlayhouseJobsService } from './playhouse-jobs';
import { wailsApi } from './wails-api';

const createdButNotSetUp = new Error(
  'the cluster did not start within 20m0s\n\nThe playhouse was created but not fully set up. This is safe to resume with:\n  acloud playhouse update demo --exposure tailscale --tailscale-oauth-client-secret <secret>',
);

describe('PlayhouseJobsService', () => {
  let jobs: PlayhouseJobsService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [MessageService] });
    // Run the action directly; the console's own streaming is not under test.
    vi.spyOn(TestBed.inject(CliConsoleService), 'run').mockImplementation(
      async (_title: string, action: (operationId: string) => Promise<unknown>) => action('op-1'),
    );
    jobs = TestBed.inject(PlayhouseJobsService);
  });

  afterEach(() => vi.restoreAllMocks());

  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('offers a resume when create failed after making the cluster', async () => {
    vi.spyOn(wailsApi, 'createPlayhouse').mockRejectedValue(createdButNotSetUp);
    const update = vi.spyOn(wailsApi, 'updatePlayhouse').mockResolvedValue();

    jobs.create('playhouse-demo', {
      Name: 'demo',
      Exposure: 'tailscale',
      TailscaleOAuthClientID: 'id',
      TailscaleOAuthClientSecret: 'secret',
      MaxPlayroomNodes: 3,
    });
    await settle();
    expect(jobs.canResume('playhouse-demo')).toBe(true);

    // The credentials are not stored in the cluster yet, so the resume repeats them.
    jobs.resume('playhouse-demo');
    await settle();
    expect(update).toHaveBeenCalledWith(
      'op-1',
      expect.objectContaining({
        Name: 'playhouse-demo',
        Exposure: 'tailscale',
        TailscaleOAuthClientID: 'id',
        TailscaleOAuthClientSecret: 'secret',
        MaxPlayroomNodes: 3,
      }),
    );
    expect(jobs.canResume('playhouse-demo')).toBe(false);
  });

  it('offers no resume when create made nothing', async () => {
    vi.spyOn(wailsApi, 'createPlayhouse').mockRejectedValue(new Error('no cloud account found'));
    jobs.create('playhouse-demo', { Name: 'demo' });
    await settle();
    expect(jobs.canResume('playhouse-demo')).toBe(false);
  });

  // A failed resume prints the same "safe to re-run" advice, so it stays offered.
  it('keeps the resume when the update fails too', async () => {
    vi.spyOn(wailsApi, 'createPlayhouse').mockRejectedValue(createdButNotSetUp);
    vi.spyOn(wailsApi, 'updatePlayhouse').mockRejectedValue(new Error('still not running'));
    jobs.create('playhouse-demo', { Name: 'demo' });
    await settle();

    jobs.resume('playhouse-demo');
    await settle();
    expect(jobs.canResume('playhouse-demo')).toBe(true);
  });
});

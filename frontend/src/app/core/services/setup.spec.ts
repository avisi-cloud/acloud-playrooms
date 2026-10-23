import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { AcloudSessionService } from './acloud-session';
import { PlayroomStateService } from './playroom-state';
import { SetupService } from './setup';
import { AcloudBinaryStatus, wailsApi } from './wails-api';
import { ToolStatus } from '../../shared/models';
import { CACHE_KEY, readCache, updateCache } from '../../shared/utils';

function binary(found: boolean): AcloudBinaryStatus {
  return {
    Path: found ? '/opt/homebrew/bin/acloud' : '',
    Source: found ? 'path' : 'none',
    Found: found,
    Version: found ? '0.39.0' : '',
    Message: '',
    ConfiguredPath: '',
    EnvironmentOverride: false,
  } as AcloudBinaryStatus;
}

function tool(command: string, state: string): ToolStatus {
  return { Name: command, Command: command, State: state, Path: '', Message: '' };
}

describe('SetupService', () => {
  let session: AcloudSessionService;
  let state: PlayroomStateService;

  /** The service reads the cache once, when it is created, as it does at launch. */
  const createSetup = (setupCompleted: boolean): SetupService => {
    updateCache({ setupCompleted });
    return TestBed.inject(SetupService);
  };

  /** Puts the installation in the state the shell has read by the end of ngOnInit. */
  const installation = (options: { acloudFound: boolean; signedIn: boolean }) => {
    session.setBinaryStatus(binary(options.acloudFound));
    state.setLoggedIn(options.signedIn);
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    session = TestBed.inject(AcloudSessionService);
    state = TestBed.inject(PlayroomStateService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('step statuses', () => {
    it('marks the required steps as needing action until each one is done', () => {
      const setup = createSetup(false);
      expect(setup.stepStatuses()).toMatchObject({
        acloud: 'needs-action',
        login: 'needs-action',
        playhouse: 'needs-action',
      });

      installation({ acloudFound: true, signedIn: true });
      state.selectPlayhouse('playhouse-demo');

      expect(setup.stepStatuses()).toMatchObject({
        acloud: 'done',
        login: 'done',
        playhouse: 'done',
      });
    });

    // Null is a binding that failed, not an acloud that is missing; neither is done.
    it('does not call acloud done before its status has been read', () => {
      expect(createSetup(false).stepStatuses().acloud).toBe('needs-action');
    });

    it('calls the tools done only once every tool is installed', async () => {
      vi.spyOn(wailsApi, 'getAcloudBinaryStatus').mockResolvedValue(binary(true));
      vi.spyOn(wailsApi, 'getAcloudVersion').mockResolvedValue('0.39.0');
      vi.spyOn(wailsApi, 'getAcloudCompatibility').mockRejectedValue(new Error('unused'));
      const getToolStatuses = vi
        .spyOn(wailsApi, 'getToolStatuses')
        .mockResolvedValue([tool('ssh', 'installed'), tool('tailscale', 'missing')]);
      const setup = createSetup(false);

      // Not read yet is not the same as nothing missing.
      expect(setup.stepStatuses().tools).toBe('optional');

      await session.loadInstallationFacts();
      expect(setup.stepStatuses().tools).toBe('optional');

      getToolStatuses.mockResolvedValue([tool('ssh', 'installed'), tool('tailscale', 'installed')]);
      await session.loadInstallationFacts();
      expect(setup.stepStatuses().tools).toBe('done');
    });

    it('keeps the defaults optional', () => {
      expect(createSetup(false).stepStatuses().defaults).toBe('optional');
    });
  });

  describe('launch decision', () => {
    it('opens setup when it was never completed', () => {
      const setup = createSetup(false);
      installation({ acloudFound: true, signedIn: true });

      expect(setup.pathToOpenAtLaunch()).toBe('/setup');
      // The launch route already opened it; the shell must not open it a second time.
      expect(setup.requiredStepThatBrokeSinceSetup()).toBeNull();
    });

    it('reopens setup at the acloud step when acloud went missing after completion', () => {
      const setup = createSetup(true);
      installation({ acloudFound: false, signedIn: false });

      expect(setup.pathToOpenAtLaunch()).toBe('/rooms');
      expect(setup.requiredStepThatBrokeSinceSetup()).toBe('acloud');
    });

    it('reopens setup at the login step when the user is signed out after completion', () => {
      const setup = createSetup(true);
      installation({ acloudFound: true, signedIn: false });

      expect(setup.requiredStepThatBrokeSinceSetup()).toBe('login');
    });

    it('stays closed when setup was completed and nothing broke', () => {
      const setup = createSetup(true);
      installation({ acloudFound: true, signedIn: true });

      expect(setup.pathToOpenAtLaunch()).toBe('/rooms');
      expect(setup.requiredStepThatBrokeSinceSetup()).toBeNull();
    });

    // playhouseGuard already sends this to the playhouse screen.
    it('does not reopen setup for a missing playhouse', () => {
      const setup = createSetup(true);
      installation({ acloudFound: true, signedIn: true });
      state.selectPlayhouse('');

      expect(setup.requiredStepThatBrokeSinceSetup()).toBeNull();
    });
  });

  describe('upgrading an install from before setup existed', () => {
    /** The cache exactly as the version before setup wrote it: no `setupCompleted` key. */
    const storeCacheFromBeforeSetup = (lastPlayhouse: string) =>
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          lastPlayhouse,
          lastPlayroom: '',
          lastEditor: 'vscode',
          lastTerminal: 'terminal',
          lastTheme: 'dark',
        }),
      );

    it('counts an old cache with a playhouse as set up, and does not open setup', () => {
      storeCacheFromBeforeSetup('playhouse-demo');

      const setup = TestBed.inject(SetupService);

      expect(setup.setupCompleted()).toBe(true);
      expect(readCache().setupCompleted).toBe(true);
      expect(setup.pathToOpenAtLaunch()).toBe('/rooms');
    });

    it('still reopens a migrated install at the step that broke', () => {
      storeCacheFromBeforeSetup('playhouse-demo');
      const setup = TestBed.inject(SetupService);

      installation({ acloudFound: false, signedIn: false });

      expect(setup.requiredStepThatBrokeSinceSetup()).toBe('acloud');
    });

    it('opens setup for an old cache without a playhouse', () => {
      storeCacheFromBeforeSetup('');

      expect(TestBed.inject(SetupService).pathToOpenAtLaunch()).toBe('/setup');
    });

    it('opens setup when there is no cache at all', () => {
      expect(TestBed.inject(SetupService).pathToOpenAtLaunch()).toBe('/setup');
    });

    // "Set up later" leaves exactly this behind, and it must keep opening setup.
    it('does not migrate a cache that already says setup was not completed', () => {
      updateCache({ lastPlayhouse: 'playhouse-demo', setupCompleted: false });

      const setup = TestBed.inject(SetupService);

      expect(setup.pathToOpenAtLaunch()).toBe('/setup');
      expect(readCache().setupCompleted).toBe(false);
    });
  });

  it('remembers that setup was completed for the next launch', () => {
    const setup = createSetup(false);

    setup.markSetupCompleted();

    expect(setup.setupCompleted()).toBe(true);
    expect(readCache().setupCompleted).toBe(true);
  });
});

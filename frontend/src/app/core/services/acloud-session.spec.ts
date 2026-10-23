import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { AcloudSessionService } from './acloud-session';
import { AcloudCompatibility, wailsApi } from './wails-api';

describe('AcloudSessionService', () => {
  let session: AcloudSessionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    session = TestBed.inject(AcloudSessionService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // The account button and setup both read this to avoid starting a second login.
  it('stays busy for the whole login, not only while the terminal opens', async () => {
    vi.useFakeTimers();
    vi.spyOn(wailsApi, 'loginWithTerminal').mockResolvedValue();
    vi.spyOn(wailsApi, 'isLoggedIn').mockResolvedValue(true);
    vi.spyOn(wailsApi, 'getCurrentUserEmail').mockResolvedValue('sem@avisi.nl');
    const terminalOpened = vi.fn();

    const login = session.signInThroughTerminal(terminalOpened);
    await vi.advanceTimersByTimeAsync(0);
    expect(terminalOpened).toHaveBeenCalledTimes(1);
    expect(session.signingInOrOut()).toBe(true);

    await vi.advanceTimersByTimeAsync(2_000);

    expect(await login).toBe(true);
    expect(session.signingInOrOut()).toBe(false);
  });

  it('is no longer busy when the terminal could not open', async () => {
    vi.spyOn(wailsApi, 'loginWithTerminal').mockRejectedValue(new Error('no terminal'));
    const terminalOpened = vi.fn();

    await expect(session.signInThroughTerminal(terminalOpened)).rejects.toThrow('no terminal');

    expect(terminalOpened).not.toHaveBeenCalled();
    expect(session.signingInOrOut()).toBe(false);
  });

  describe('compatibility notice', () => {
    function loadWith(compatibility: Partial<AcloudCompatibility>): Promise<void> {
      vi.spyOn(wailsApi, 'getAcloudBinaryStatus').mockResolvedValue({
        Found: true,
      } as Awaited<ReturnType<typeof wailsApi.getAcloudBinaryStatus>>);
      vi.spyOn(wailsApi, 'getAcloudVersion').mockResolvedValue('0.39.0');
      vi.spyOn(wailsApi, 'getToolStatuses').mockResolvedValue([]);
      vi.spyOn(wailsApi, 'getAcloudCompatibility').mockResolvedValue({
        RunningVersion: '0.39.0',
        VerifiedVersion: '0.39.0',
        MinimumVersion: '0.39.0',
        RunningVersionIsNewerThanVerified: false,
        RunningVersionIsOlderThanMinimum: false,
        Explanation: '',
        ...compatibility,
      });
      return session.loadInstallationFacts();
    }

    // Too old means commands fail, so it must reach the sidebar.
    it('shows an acloud older than the minimum', async () => {
      await loadWith({ RunningVersionIsOlderThanMinimum: true, Explanation: 'needs 0.39.0' });
      expect(session.compatibility()?.RunningVersionIsOlderThanMinimum).toBe(true);
    });

    it('shows an acloud newer than verified', async () => {
      await loadWith({ RunningVersion: '0.40.0', RunningVersionIsNewerThanVerified: true });
      expect(session.compatibility()?.RunningVersionIsNewerThanVerified).toBe(true);
    });

    it('stays quiet for the verified 0.39 release', async () => {
      await loadWith({});
      expect(session.compatibility()).toBeNull();
    });

    // Picking another acloud in Settings can change the version under the notice.
    it('reads the version again when the binary changes', async () => {
      await loadWith({});
      vi.spyOn(wailsApi, 'getAcloudCompatibility').mockResolvedValue({
        RunningVersion: '0.37.0',
        VerifiedVersion: '0.39.0',
        MinimumVersion: '0.39.0',
        RunningVersionIsNewerThanVerified: false,
        RunningVersionIsOlderThanMinimum: true,
        Explanation: 'needs 0.39.0',
      });

      await session.setBinaryStatus({ Found: true } as Awaited<
        ReturnType<typeof wailsApi.getAcloudBinaryStatus>
      >);

      expect(session.compatibility()?.RunningVersionIsOlderThanMinimum).toBe(true);
    });
  });
});

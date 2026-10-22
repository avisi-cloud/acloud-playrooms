import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { AcloudSessionService } from './acloud-session';
import { wailsApi } from './wails-api';

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
});

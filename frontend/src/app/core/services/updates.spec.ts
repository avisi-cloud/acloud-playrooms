import { TestBed } from '@angular/core/testing';
import { readCache, updateCache } from '../../shared/utils/cache';
import { UpdatesService } from './updates';
import { wailsApi } from './wails-api';

describe('UpdatesService', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(wailsApi, 'getAppVersion').mockResolvedValue('1.2.0');
    vi.spyOn(wailsApi, 'checkUpdates').mockResolvedValue({
      AppVersion: '1.3.0',
      AcloudVersion: '0.41.0',
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('shows both available versions with manual upgrade commands and checks once per session', async () => {
    const service = TestBed.inject(UpdatesService);
    await service.start();
    await service.start();
    expect(wailsApi.checkUpdates).toHaveBeenCalledExactlyOnceWith(true);
    expect(service.notices()).toEqual([
      {
        kind: 'app',
        version: '1.3.0',
        title: 'Version 1.3.0 is available',
        releaseUrl: 'https://github.com/avisi-cloud/acloud-playrooms/releases/tag/v1.3.0',
        command: 'brew upgrade --cask acloud-playrooms',
      },
      {
        kind: 'acloud',
        version: '0.41.0',
        title: 'acloud 0.41.0 is available according to Homebrew',
        releaseUrl: '',
        command: 'brew upgrade --cask avisi-cloud/tools/acloud',
      },
    ]);
    expect(service.sidebarLabel()).toBe('Update 1.3.0 available');
    expect(service.availableUpdates()).toHaveLength(2);
    expect(service.whatsNew()).toBeUndefined();
    expect(readCache().lastSeenAppVersion).toBe('1.2.0');
    service.dismiss('app');
    expect(service.notices().map((notice) => notice.kind)).toEqual(['acloud']);
    expect(service.sidebarLabel()).toBe('acloud 0.41.0 available');
    service.dismiss('acloud');
    expect(service.sidebarLabel()).toBe('');
  });

  it('shows what is new once after the version changes, including with app checks disabled', async () => {
    updateCache({ lastSeenAppVersion: '1.1.0', checkForUpdates: false });
    let service = TestBed.inject(UpdatesService);
    await service.start();
    expect(wailsApi.checkUpdates).toHaveBeenCalledWith(false);
    expect(service.notices().find((notice) => notice.kind === 'whats-new')?.title).toBe(
      "What's new in 1.2.0",
    );
    expect(service.notices().some((notice) => notice.kind === 'app')).toBe(false);
    TestBed.resetTestingModule();
    service = TestBed.inject(UpdatesService);
    await service.start();
    expect(service.notices().some((notice) => notice.kind === 'whats-new')).toBe(false);
  });

  it('saves the switch and hides an app notice immediately', async () => {
    const service = TestBed.inject(UpdatesService);
    await service.start();
    service.setCheckForUpdates(false);
    expect(readCache().checkForUpdates).toBe(false);
    expect(service.notices().some((notice) => notice.kind === 'app')).toBe(false);
    expect(service.notices().some((notice) => notice.kind === 'acloud')).toBe(true);
  });

  it('stays quiet for failed checks and unknown app versions', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.mocked(wailsApi.getAppVersion).mockResolvedValue('dev');
    vi.mocked(wailsApi.checkUpdates).mockRejectedValue(new Error('offline'));
    const service = TestBed.inject(UpdatesService);
    await service.start();
    expect(service.notices()).toEqual([]);
    expect(readCache().lastSeenAppVersion).toBe('');
  });
});

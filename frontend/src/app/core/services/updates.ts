import { Injectable, computed, signal } from '@angular/core';
import { readCache, updateCache } from '../../shared/utils/cache';
import { wailsApi } from './wails-api';

type UpdateNoticeKind = 'app' | 'acloud' | 'whats-new';
export interface UpdateNotice {
  kind: UpdateNoticeKind;
  title: string;
  version: string;
  releaseUrl: string;
  command: string;
}

const releaseNotesUrl = (version: string) =>
  `https://github.com/avisi-cloud/acloud-playrooms/releases/tag/v${encodeURIComponent(version.replace(/^v/, '').split('+')[0])}`;

@Injectable({ providedIn: 'root' })
export class UpdatesService {
  readonly checkForUpdates = signal(readCache().checkForUpdates);
  private readonly allNotices = signal<UpdateNotice[]>([]);
  readonly notices = computed(() =>
    this.allNotices().filter((notice) => notice.kind !== 'app' || this.checkForUpdates()),
  );
  readonly availableUpdates = computed(() =>
    this.notices().filter((notice) => notice.kind !== 'whats-new'),
  );
  readonly whatsNew = computed(() => this.notices().find((notice) => notice.kind === 'whats-new'));
  readonly sidebarLabel = computed(() => {
    const notice =
      this.availableUpdates().find((notice) => notice.kind === 'app') ?? this.availableUpdates()[0];
    if (!notice) return '';
    return notice.kind === 'app'
      ? `Update ${notice.version} available`
      : `acloud ${notice.version} available`;
  });
  private started = false;

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await Promise.all([this.showWhatsNew(), this.checkAvailableUpdates()]);
  }

  setCheckForUpdates(enabled: boolean): void {
    this.checkForUpdates.set(enabled);
    updateCache({ checkForUpdates: enabled });
    if (enabled) void this.checkAvailableUpdates();
  }

  dismiss(kind: UpdateNoticeKind): void {
    this.allNotices.update((notices) => notices.filter((notice) => notice.kind !== kind));
  }

  private async showWhatsNew(): Promise<void> {
    try {
      const version = await wailsApi.getAppVersion();
      if (!/^v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(version)) return;
      const previous = readCache().lastSeenAppVersion;
      if (previous && previous !== version)
        this.addNotice({
          kind: 'whats-new',
          version,
          title: `What's new in ${version}`,
          releaseUrl: releaseNotesUrl(version),
          command: '',
        });
      updateCache({ lastSeenAppVersion: version });
    } catch (error) {
      console.warn('Could not read app version', error);
    }
  }

  private async checkAvailableUpdates(): Promise<void> {
    try {
      const status = await wailsApi.checkUpdates(this.checkForUpdates());
      if (status.AppVersion && this.checkForUpdates())
        this.addNotice({
          kind: 'app',
          version: status.AppVersion,
          title: `Version ${status.AppVersion} is available`,
          releaseUrl: releaseNotesUrl(status.AppVersion),
          command: 'brew upgrade --cask acloud-playrooms',
        });
      if (status.AcloudVersion)
        this.addNotice({
          kind: 'acloud',
          version: status.AcloudVersion,
          title: `acloud ${status.AcloudVersion} is available according to Homebrew`,
          releaseUrl: '',
          command: 'brew upgrade --cask avisi-cloud/tools/acloud',
        });
    } catch (error) {
      console.warn('Could not check for updates', error);
    }
  }

  private addNotice(notice: UpdateNotice): void {
    this.allNotices.update((notices) => [
      ...notices.filter((entry) => entry.kind !== notice.kind),
      notice,
    ]);
  }
}

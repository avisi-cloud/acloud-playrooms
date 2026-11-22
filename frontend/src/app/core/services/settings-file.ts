import { Injectable, inject, signal } from '@angular/core';
import {
  EveningStopDays,
  PlayroomDefaultState,
  SETTINGS_FILE_FORMAT,
  SETTINGS_FILE_VERSION,
  SettingsChange,
  SettingsFile,
  listSettingsChanges,
  readSettingsFile,
  writeSettingsFile,
} from '../../shared/utils/settings-file';
import { DesktopNotificationsService } from './desktop-notifications';
import { EnvironmentService } from './environment';
import { EveningStopService } from './evening-stop';
import { MenuBarService } from './menu-bar';
import { PlayroomDefaultsService } from './playroom-defaults';
import { PlayroomStateService } from './playroom-state';
import { ToastService } from './toast';
import { UpdatesService } from './updates';
import { wailsApi } from './wails-api';

/** A file that was read and validated, waiting for the user to confirm its changes. */
export interface PendingImport {
  file: SettingsFile;
  changes: SettingsChange[];
}

/** Exports and imports the Settings screen's preferences and the `playroom config` defaults. */
@Injectable({ providedIn: 'root' })
export class SettingsFileService {
  private readonly state = inject(PlayroomStateService);
  private readonly updates = inject(UpdatesService);
  private readonly desktop = inject(DesktopNotificationsService);
  private readonly menuBar = inject(MenuBarService);
  private readonly environment = inject(EnvironmentService);
  private readonly schedule = inject(EveningStopService);
  private readonly defaults = inject(PlayroomDefaultsService);
  private readonly notify = inject(ToastService);
  readonly busy = signal(false);
  readonly pendingImport = signal<PendingImport | null>(null);

  async exportSettings(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const [current, defaults] = await Promise.all([
        this.readCurrentSettings(),
        this.readCurrentPlayroomDefaults(),
      ]);
      const playroomDefaults = Object.fromEntries(
        defaults
          .filter((entry) => entry.configuredValue)
          .map((entry) => [entry.key, entry.configuredValue]),
      );
      await wailsApi.exportSettings(writeSettingsFile({ ...current, playroomDefaults }));
    } catch (error) {
      this.notify.failure('Could not export settings', error);
    } finally {
      this.busy.set(false);
    }
  }

  /** Reads the chosen file and lists its changes; nothing is applied until `applyPendingImport`. */
  async chooseSettingsToImport(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const text = await wailsApi.readSettingsToImport();
      if (!text) return;
      const [current, defaults] = await Promise.all([
        this.readCurrentSettings(),
        this.readCurrentPlayroomDefaults(),
      ]);
      const next = readSettingsFile(
        text,
        defaults.map((entry) => entry.key),
      );
      this.pendingImport.set({ file: next, changes: listSettingsChanges(current, defaults, next) });
    } catch (error) {
      this.notify.failure('Could not import settings', error);
    } finally {
      this.busy.set(false);
    }
  }

  cancelPendingImport(): void {
    this.pendingImport.set(null);
  }

  /** Applies in the listed order and stops at the first failure, so what ran is clear. */
  async applyPendingImport(): Promise<void> {
    const pending = this.pendingImport();
    if (!pending || this.busy()) return;
    this.busy.set(true);
    this.pendingImport.set(null);
    let current: SettingsChange | undefined;
    try {
      // One save covers every evening stop change.
      const firstEveningStop = pending.changes.find((change) => change.section === 'Evening stop');
      for (const change of pending.changes) {
        if (change.section === 'Evening stop' && change !== firstEveningStop) continue;
        current = change;
        await this.applyChange(change, pending.file);
      }
      this.notify.toast(
        pending.changes.length === 1
          ? 'Imported 1 setting'
          : `Imported ${pending.changes.length} settings`,
        'ok',
      );
    } catch (error) {
      this.notify.failure(`Import stopped at "${current?.label}"`, error);
    } finally {
      if (pending.changes.some((change) => change.section === 'Playroom defaults'))
        this.defaults.forgetCachedDefaults();
      this.busy.set(false);
    }
  }

  private async applyChange(change: SettingsChange, file: SettingsFile): Promise<void> {
    switch (change.section) {
      case 'App preferences':
        return this.applyAppPreference(change.key, file.appPreferences);
      case 'Tool paths':
        return this.applyToolPath(change.key, change.nextPath);
      case 'Playroom defaults':
        return this.defaults.saveDefault(change.key, change.nextValue, change.builtin);
      case 'Evening stop':
        return this.applyEveningStop(file.eveningStop);
    }
  }

  private applyAppPreference(
    key: keyof SettingsFile['appPreferences'],
    next: SettingsFile['appPreferences'],
  ): void {
    switch (key) {
      case 'theme':
        return this.state.setThemePreference(next.theme);
      case 'backgroundGrain':
        return this.state.setBackgroundGrain(next.backgroundGrain);
      case 'ameRobot':
        return this.state.setAmeRobot(next.ameRobot);
      case 'checkForUpdates':
        return this.updates.setCheckForUpdates(next.checkForUpdates);
      case 'notifications':
        return this.desktop.setNotifications(next.notifications);
      case 'dockBadge':
        return this.desktop.setDockBadge(next.dockBadge);
      case 'keepRunningInMenuBar':
        return this.menuBar.setKeepRunningInMenuBar(next.keepRunningInMenuBar);
      case 'preferredAction':
        return this.state.setPreferredAction(next.preferredAction);
      case 'readVariablesFromLoginShell':
        return this.environment.setReadVariablesFromLoginShell(next.readVariablesFromLoginShell);
    }
  }

  private async applyToolPath(key: keyof SettingsFile['toolPaths'], path: string): Promise<void> {
    switch (key) {
      case 'acloud':
        await (path ? wailsApi.setAcloudBinary(path) : wailsApi.clearAcloudBinary());
        return;
      case 'tailscale':
        return path ? wailsApi.setTailscaleBinary(path) : wailsApi.clearTailscaleBinary();
      case 't3Code':
        return path ? wailsApi.setT3CodePath(path) : wailsApi.clearT3CodePath();
    }
  }

  private async applyEveningStop(next: SettingsFile['eveningStop']): Promise<void> {
    const expected = {
      Enabled: next.enabled,
      Time: next.time,
      Days: next.days,
      IdleHours: next.idleHours,
    };
    await this.schedule.save(expected);
    const saved = this.schedule.settings();
    // The schedule service reports its own failure and keeps the old settings.
    if (
      saved?.Enabled !== expected.Enabled ||
      saved.Time !== expected.Time ||
      saved.Days !== expected.Days ||
      saved.IdleHours !== expected.IdleHours
    )
      throw new Error('The evening stop settings were not saved.');
  }

  private async readCurrentSettings(): Promise<Omit<SettingsFile, 'playroomDefaults'>> {
    const schedule = this.schedule.settings();
    if (!schedule)
      throw new Error('Evening stop settings are not loaded yet. Reopen Settings and try again.');
    const [acloud, tailscale, t3Code] = await Promise.all([
      wailsApi.getAcloudBinaryStatus(),
      wailsApi.getTailscaleBinaryStatus(),
      wailsApi.getT3CodePathStatus(),
    ]);
    return {
      format: SETTINGS_FILE_FORMAT,
      version: SETTINGS_FILE_VERSION,
      appPreferences: {
        theme: this.state.themePreference(),
        backgroundGrain: this.state.backgroundGrain(),
        ameRobot: this.state.ameRobot(),
        checkForUpdates: this.updates.checkForUpdates(),
        notifications: this.desktop.notifications(),
        dockBadge: this.desktop.dockBadge(),
        keepRunningInMenuBar: this.menuBar.keepRunningInMenuBar(),
        preferredAction: this.state.preferredAction(),
        readVariablesFromLoginShell: this.environment.readVariablesFromLoginShell(),
      },
      eveningStop: {
        enabled: schedule.Enabled,
        time: schedule.Time,
        days: schedule.Days as EveningStopDays,
        idleHours: schedule.IdleHours,
      },
      toolPaths: {
        acloud: acloud.ConfiguredPath,
        tailscale: tailscale.ConfiguredPath,
        t3Code: t3Code.ConfiguredPath,
      },
    };
  }

  /** Read fresh rather than from the cache, so an export never carries a stale default. */
  private async readCurrentPlayroomDefaults(): Promise<PlayroomDefaultState[]> {
    const entries = await wailsApi.getPlayroomDefaults();
    return entries.map((entry) => ({
      key: entry.Key,
      configuredValue: entry.Source === 'config' ? entry.Value : '',
      builtin: entry.Builtin,
    }));
  }
}

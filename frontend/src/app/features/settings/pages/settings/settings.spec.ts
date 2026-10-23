import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { wailsApi } from '../../../../core/services/wails-api';
import { routes } from '../../../../app.routes';
import { SettingsPageComponent } from './settings';
import { DefaultsPageComponent } from '../../../defaults/pages/defaults/defaults';

describe('Settings page', () => {
  beforeEach(async () => {
    vi.spyOn(wailsApi, 'getAcloudBinaryStatus').mockResolvedValue({
      Path: '',
      Source: 'none',
      Found: false,
      Version: '',
      Message: 'Acloud not found',
      ConfiguredPath: '',
      EnvironmentOverride: false,
    });
    vi.spyOn(wailsApi, 'getAcloudVersion').mockResolvedValue('');
    vi.spyOn(wailsApi, 'getAcloudCompatibility').mockResolvedValue({
      RunningVersion: '',
      VerifiedVersion: '0.39.0',
      MinimumVersion: '0.39.0',
      RunningVersionIsNewerThanVerified: false,
      RunningVersionIsOlderThanMinimum: false,
      Explanation: '',
    });
    vi.spyOn(wailsApi, 'getToolStatuses').mockResolvedValue([]);
    vi.spyOn(wailsApi, 'getTailscaleBinaryStatus').mockResolvedValue({
      Path: '/opt/homebrew/bin/tailscale',
      Source: 'known-location',
      Found: true,
      Version: '1.104.2',
      Message: '',
      ConfiguredPath: '',
    });
    vi.spyOn(wailsApi, 'getT3CodePathStatus').mockResolvedValue({
      Path: '/Applications/T3 Code (Beta).app',
      Source: 'known-location',
      Found: true,
      Version: '0.1.2',
      Message: '',
      ConfiguredPath: '',
      IsApplication: true,
    });
    await TestBed.configureTestingModule({
      imports: [SettingsPageComponent],
      providers: [MessageService, provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => vi.restoreAllMocks());

  it('keeps all local path controls usable even when Acloud is missing', async () => {
    const fixture = TestBed.createComponent(SettingsPageComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('app-acloud-binary')).not.toBeNull();
    expect(root.querySelector('app-tailscale-binary')).not.toBeNull();
    expect(root.querySelector('app-t3-code-path')).not.toBeNull();
  });

  it('gives Defaults and Settings separate, unguarded routes', async () => {
    const defaults = routes.find((route) => route.path === 'defaults');
    const settings = routes.find((route) => route.path === 'settings');
    expect(await defaults?.loadComponent?.()).toBe(DefaultsPageComponent);
    expect(await settings?.loadComponent?.()).toBe(SettingsPageComponent);
    expect(defaults?.canActivate).toBeUndefined();
    expect(settings?.canActivate).toBeUndefined();
  });

  it('moves setup access to Settings', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(SettingsPageComponent);
    fixture.componentInstance.runSetupAgain();
    expect(navigate).toHaveBeenCalledWith(['/setup']);
  });
});

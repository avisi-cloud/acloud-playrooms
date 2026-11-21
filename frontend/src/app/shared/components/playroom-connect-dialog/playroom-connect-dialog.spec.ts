import { PlayroomStateService } from '../../../core/services/playroom-state';
import { CliConsoleService } from '../../../core/services/cli-console';
import { ToastService } from '../../../core/services/toast';
import { wailsApi } from '../../../core/services/wails-api';
import { By } from '@angular/platform-browser';
import { Dialog } from 'primeng/dialog';
import { SimpleChange } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { vi } from 'vitest';
import { PlayroomDefaultsService } from '../../../core/services/playroom-defaults';
import { CONNECTION_PATHS } from '../../data';
import { Playroom } from '../../models';
import { PlayroomConnectDialogComponent } from './playroom-connect-dialog';

const room = { name: 'demo', playhouse: 'playhouse-demo' } as Playroom;

function dialog() {
  const component = TestBed.createComponent(PlayroomConnectDialogComponent).componentInstance;
  component.room = room;
  return component;
}

describe('Playroom connect dialog', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlayroomConnectDialogComponent],
      providers: [MessageService],
    }).compileComponents();
    vi.spyOn(
      TestBed.inject(PlayroomDefaultsService),
      'loadConfiguredDefaultsOnce',
    ).mockResolvedValue();
  });

  afterEach(() => vi.restoreAllMocks());

  function escapeDialog() {
    const fixture = TestBed.createComponent(PlayroomConnectDialogComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const primeDialog = fixture.debugElement.query(By.directive(Dialog))
      .componentInstance as Dialog;
    const panel = document.createElement('div');
    const control = document.createElement('button');
    panel.append(control);
    document.body.append(panel);
    vi.spyOn(primeDialog, 'container').mockReturnValue(panel);
    component.visible = true;
    const changed = vi.fn();
    component.visibleChange.subscribe(changed);
    return { component, control, panel, changed };
  }

  it('closes the custom-header dialog on Escape from a focused control', () => {
    const { component, control, panel, changed } = escapeDialog();
    control.focus();
    control.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(component.visible).toBe(false);
    expect(changed).toHaveBeenCalledExactlyOnceWith(false);
    panel.remove();
  });

  it('leaves Escape consumed by a child control to that control', () => {
    const { component, control, panel, changed } = escapeDialog();
    control.addEventListener('keydown', (event) => event.preventDefault());
    control.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(component.visible).toBe(true);
    expect(changed).not.toHaveBeenCalled();
    panel.remove();
  });

  it('ignores Escape from outside its panel or while closed', () => {
    const { component, control, panel, changed } = escapeDialog();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(component.visible).toBe(true);
    component.visible = false;
    control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(changed).not.toHaveBeenCalled();
    panel.remove();
  });

  // Blank leaves --via off, so acloud reaches the room the way it is exposed.
  it('leaves the connection path to the room by default', () => {
    const component = dialog();
    expect(component.connectInput().Via).toBe('');
    expect(component.openInput().Via).toBe('');
  });

  it('sends the chosen connection path for both connect and open', () => {
    const component = dialog();
    component.via = 'portforward';
    expect(component.connectInput().Via).toBe('portforward');
    expect(component.openInput().Via).toBe('portforward');
  });

  it('starts every opening on the default again', () => {
    const component = dialog();
    component.via = 'nodeport';
    component.visible = true;
    component.ngOnChanges({ visible: new SimpleChange(false, true, false) });
    expect(component.via).toBe('');
  });

  // acloud falls back from a `via` default a room cannot use; an explicit --via fails instead.
  it('names your connection default without sending it', async () => {
    vi.spyOn(TestBed.inject(PlayroomDefaultsService), 'configuredText').mockImplementation(
      (key: string, fallback = '') => (key === 'via' ? 'nodeport' : fallback),
    );
    const component = dialog();
    component.visible = true;
    component.ngOnChanges({ visible: new SimpleChange(false, true, false) });
    await vi.waitFor(() => expect(component.selectedConnectionPathHint()).toContain('NodePort'));
    expect(component.selectedConnectionPathHint()).toContain('Your default');
    expect(component.connectInput().Via).toBe('');
    expect(component.openInput().Via).toBe('');
  });

  it('describes every connection path', () => {
    const component = dialog();
    for (const path of CONNECTION_PATHS) {
      component.via = path.id;
      expect(component.selectedConnectionPathHint(), path.id || 'default').toBe(path.hint);
    }
  });
});

describe('NodePort allowlist help', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [PlayroomConnectDialogComponent],
      providers: [MessageService],
    });
    TestBed.inject(PlayroomStateService).selectPlayhouse(room.playhouse);
    vi.spyOn(TestBed.inject(CliConsoleService), 'run').mockImplementation(async (_label, run) => {
      await run('allow-ip');
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('offers help only for a known NodePort path in the active playhouse', () => {
    const component = dialog();
    expect(component.canAllowCurrentIP()).toBe(false);
    component.via = 'nodeport';
    expect(component.canAllowCurrentIP()).toBe(true);
    component.via = '';
    component.configuredVia = 'nodeport';
    expect(component.canAllowCurrentIP()).toBe(true);
    component.via = 'tailscale';
    expect(component.canAllowCurrentIP()).toBe(false);
    component.via = 'nodeport';
    TestBed.inject(PlayroomStateService).selectPlayhouse('other');
    expect(component.canAllowCurrentIP()).toBe(false);
  });

  it('previews and confirms the same input, then offers connect again', async () => {
    const update = vi.spyOn(wailsApi, 'updatePlayhouse').mockResolvedValue();
    const component = dialog();
    component.via = 'nodeport';
    const previewInput = component.allowCurrentIPInput();
    component.requestAllowCurrentIP();
    expect(update).not.toHaveBeenCalled();
    expect(component.confirmingAllowCurrentIP).toBe(true);
    await component.allowCurrentIP();
    expect(update).toHaveBeenCalledWith('allow-ip', previewInput);
    expect(previewInput).toEqual({ Name: room.playhouse, AllowCurrentIP: true });
    expect(component.allowCurrentIPComplete).toBe(true);
    expect(component.confirmingAllowCurrentIP).toBe(false);
  });

  it('refuses confirmation after the selection changes', async () => {
    const update = vi.spyOn(wailsApi, 'updatePlayhouse').mockResolvedValue();
    const component = dialog();
    component.via = 'nodeport';
    component.requestAllowCurrentIP();
    TestBed.inject(PlayroomStateService).noteScopeChange();
    await component.allowCurrentIP();
    expect(update).not.toHaveBeenCalled();
  });

  it('reports failure without offering connect again', async () => {
    vi.spyOn(wailsApi, 'updatePlayhouse').mockRejectedValue(new Error('network unavailable'));
    const component = dialog();
    component.via = 'nodeport';
    component.requestAllowCurrentIP();
    await component.allowCurrentIP();
    expect(component.allowCurrentIPComplete).toBe(false);
    expect(component.allowingCurrentIP).toBe(false);
    expect(TestBed.inject(ToastService).history()[0].summary).toBe(
      'Could not add your current IP to the allowlist',
    );
  });

  it('offers the health check when a connect fails for a reason no fix knows', async () => {
    vi.spyOn(wailsApi, 'connectPlayroom').mockRejectedValue(new Error('ssh: connection refused'));
    const component = dialog();
    TestBed.inject(PlayroomStateService).selectPlayhouse('playhouse-demo');
    await component.execute();
    const failure = TestBed.inject(ToastService).history()[0];
    expect(failure.summary).toBe('Could not open "demo"');
    expect(failure.action?.label).toBe('Run health check');
  });

  it('keeps a recognised fix instead of the health check', async () => {
    vi.spyOn(wailsApi, 'connectPlayroom').mockRejectedValue(
      new Error('ensure local kubeconfig: session not active'),
    );
    const component = dialog();
    await component.execute();
    expect(TestBed.inject(ToastService).history()[0].action?.label).toBe(
      'Sign in to the playhouse again',
    );
  });
});

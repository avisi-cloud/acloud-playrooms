import { describeChanges } from './describe-changes';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { PlayroomLifecycleService } from '../../../core/services/playroom-lifecycle';
import { PlayroomStateService } from '../../../core/services/playroom-state';
import { UiSessionService } from '../../../core/services/ui-session';
import { ToastService } from '../../../core/services/toast';
import { wailsApi } from '../../../core/services/wails-api';
import { Playroom, UpdateForm } from '../../models';
import { blankUpdateForm } from '../../utils';
import { PlayroomUpdateDrawerComponent } from './playroom-update-drawer';

function room(disk: string): Playroom {
  return {
    name: 'demo',
    owner: 'sem@avisi.nl',
    status: 'ready',
    rawStatus: '',
    ageMin: 5,
    disk,
    diskType: 'persistent',
    host: '',
    image: 'claude-code',
    cpuReq: '250m',
    cpuLim: '4',
    memReq: '2Gi',
    memLim: '2Gi',
    ports: '',
    system: 'read-only',
    capabilityProfile: 'minimal',
    capabilityAdditions: [],
    outdated: false,
    playhouse: 'playhouse-demo',
    ephemeral: false,
    env: [],
    git: [],
    copy: [],
  };
}

function drawerFor(disk: string) {
  const component = TestBed.createComponent(PlayroomUpdateDrawerComponent).componentInstance;
  component.room = room(disk);
  component.form = blankUpdateForm(component.room);
  return component;
}

describe('Update playroom drawer', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlayroomUpdateDrawerComponent],
      providers: [MessageService],
    }).compileComponents();
  });

  afterEach(() => vi.restoreAllMocks());

  // "3" is on its way to "30Gi"; calling it too small while it is typed would
  // flash an error at every keystroke.
  it('waits until the storage field is left before calling a size too small', () => {
    const component = drawerFor('20Gi');
    component.form.storage = '3';
    expect(component.storageError()).toBe('');
    expect(component.blockingError()).toBe('');

    component.storageTouched = true;
    expect(component.storageError()).toBe('Storage can only grow: pick more than 20Gi.');
    expect(component.blockingError()).toBe(component.storageError());
  });

  it('counts draft changes, tints only edited cards, and clears them when discarded', () => {
    const component = drawerFor('20Gi');
    expect(component.changeCount()).toBe(0);
    component.form.storage = '40Gi';
    expect(component.changeCount()).toBe(1);
    expect(component.cardChanged('storage')).toBe(true);
    expect(component.cardChanged('image')).toBe(false);
    expect(component.needsNewSpec()).toBe(false);
    component.form.memLim = '8Gi';
    expect(component.changeCount()).toBe(2);
    expect(component.needsNewSpec()).toBe(true);
    component.discardDraft();
    expect(component.changeCount()).toBe(0);
    expect(component.needsNewSpec()).toBe(false);
    component.room = { ...component.room!, outdated: true };
    expect(component.needsNewSpec()).toBe(true);
  });

  it('counts run options by name without comparing them', () => {
    const component = drawerFor('20Gi');
    component.form.noWait = true;
    component.form.waitTimeout = '30m';
    expect(component.changeCount()).toBe(2);
    expect(component.comparisonFor('noWait')).toBe('');
    expect(component.comparisonFor('waitTimeout')).toBe('');
    expect(component.actionSummary()).toBe('Return immediately · Wait timeout');
  });

  it('allows a size that grows the volume', () => {
    const component = drawerFor('20Gi');
    component.form.storage = '30Gi';
    component.storageTouched = true;
    expect(component.blockingError()).toBe('');
  });

  it('leaves the size to acloud when the current size is unknown', () => {
    const component = drawerFor('');
    component.form.storage = '1Gi';
    component.storageTouched = true;
    expect(component.storageError()).toBe('');
  });

  it('names the deletion on the Update button while the namespace is being removed', () => {
    const component = drawerFor('20Gi');
    expect(component.updateButtonLabel()).toBe('Update');
    expect(component.updateButtonSeverity()).toBeNull();

    component.form.changeWorkspaceNamespace = true;
    component.form.workspaceNamespace = false;
    expect(component.updateButtonLabel()).toBe('Update and delete namespace');
    expect(component.updateButtonSeverity()).toBe('danger');
  });

  it('keeps the current profile first, and has a hint for every profile', () => {
    const options = drawerFor('20Gi').capabilitiesOptions;
    expect(options[0].id).toBe('');
    expect(options.every((option) => option.hint.length > 0)).toBe(true);
  });

  it('closes before updating finishes and keeps the operation alive after destruction', async () => {
    const state = TestBed.inject(PlayroomStateService);
    state.selectPlayhouse('playhouse-demo');
    state.setRooms([room('20Gi')]);
    const actions = TestBed.inject(PlayroomLifecycleService);
    TestBed.tick();
    vi.spyOn(actions, 'reload').mockResolvedValue([]);
    const toast = vi.spyOn(TestBed.inject(ToastService), 'toast');
    let finishCommand = () => {};
    vi.spyOn(wailsApi, 'updatePlayroom').mockReturnValue(
      new Promise<void>((resolve) => {
        finishCommand = resolve;
      }),
    );
    const fixture = TestBed.createComponent(PlayroomUpdateDrawerComponent);
    const component = fixture.componentInstance;
    component.form = blankUpdateForm(room('20Gi'));
    component.visible = true;
    const visibleChange = vi.fn();
    component.visibleChange.subscribe(visibleChange);

    component.save();

    expect(component.visible).toBe(false);
    expect(visibleChange).toHaveBeenCalledWith(false);
    expect(actions.pendingOperation('demo')).toBe('Updating');
    fixture.destroy();
    finishCommand();
    await vi.waitFor(() => expect(actions.pendingOperation('demo')).toBe(''));
    expect(toast).toHaveBeenCalledWith('Updated "demo"', 'ok', expect.any(String));
    expect(TestBed.inject(UiSessionService).recall('update:demo')).toBeUndefined();
  });

  it('allows dismissal while the room is still being updated', async () => {
    TestBed.inject(PlayroomStateService).selectPlayhouse('playhouse-demo');
    const actions = TestBed.inject(PlayroomLifecycleService);
    TestBed.tick();
    vi.spyOn(actions, 'reload').mockResolvedValue([]);
    let finishCommand = () => {};
    vi.spyOn(wailsApi, 'updatePlayroom').mockReturnValue(
      new Promise<void>((resolve) => {
        finishCommand = resolve;
      }),
    );
    const component = drawerFor('20Gi');
    actions.startUpdate(component.form);
    component.visible = true;
    expect(component.submitting).toBe(true);
    component.close();
    expect(component.visible).toBe(false);
    finishCommand();
    await vi.waitFor(() => expect(actions.pendingOperation('demo')).toBe(''));
  });
});

describe('describeChanges for a playroom', () => {
  it('starts with every setting unchanged and keeps unknown values unknown', () => {
    const current = room('20Gi');
    const changes = describeChanges(current, blankUpdateForm(current));
    expect(changes.every((change) => !change.changed)).toBe(true);
    expect(changes.find((change) => change.field === 'workspaceNamespace')?.current).toBeNull();
    expect(changes.find((change) => change.field === 'ephemeral')?.current).toBe('Off');
  });

  it.each([
    ['image', { image: 'another-image' }, true],
    ['storage', { storage: '40Gi' }, false],
    ['cpuReq', { cpuReq: '1' }, true],
    ['cpuLim', { cpuLim: '8' }, true],
    ['memReq', { memReq: '4Gi' }, true],
    ['memLim', { memLim: '8Gi' }, true],
    ['readOnly', { changeReadOnly: true, readOnly: false }, true],
    ['ports', { changePorts: true, ports: ['8080'] }, false],
    ['capabilities', { capabilities: 'standard' }, true],
    ['capAdd', { changeCapAdd: true, capAdd: ['NET_ADMIN'] }, true],
    ['workspaceNamespace', { changeWorkspaceNamespace: true }, true],
    ['moveToTailscale', { moveToTailscale: true }, false],
    ['nodePortSSH', { changeNodePortSSH: true }, false],
    ['noWait', { noWait: true }, false],
    ['waitTimeout', { waitTimeout: '30m' }, false],
  ] as const)('describes %s and its restart impact', (field, edit, needsNewSpec) => {
    const current = room('20Gi');
    const form = { ...blankUpdateForm(current), ...edit } as UpdateForm;
    const change = describeChanges(current, form).find((change) => change.field === field);
    expect(change).toMatchObject({ changed: true, needsNewSpec });
    expect(describeChanges(current, form).filter((change) => change.changed)).toHaveLength(1);
  });

  it('does not count equivalent quantities or blank keep-current fields', () => {
    const current = room('20Gi');
    const form = blankUpdateForm(current);
    Object.assign(form, {
      cpuReq: '0.25',
      cpuLim: '4000m',
      memReq: '2048Mi',
      storage: '20480Mi',
      image: ' ',
    });
    expect(describeChanges(current, form).every((change) => !change.changed)).toBe(true);
  });

  it('compares replacement lists without counting blank rows or order', () => {
    const current = {
      ...room('20Gi'),
      ports: '80 → 3000, 8080',
      capabilityAdditions: ['NET_ADMIN', 'SYS_PTRACE'],
    };
    const form = blankUpdateForm(current);
    Object.assign(form, {
      changePorts: true,
      ports: ['8080', '80:3000', ''],
      changeCapAdd: true,
      capAdd: ['SYS_PTRACE', ' NET_ADMIN ', ''],
    });
    expect(describeChanges(current, form).every((change) => !change.changed)).toBe(true);
    Object.assign(form, { clearPorts: true, clearCapAdd: true });
    expect(
      describeChanges(current, form)
        .filter((change) => change.changed)
        .map((change) => change.proposed),
    ).toEqual(['None', 'None']);
  });

  it('compares an explicitly unchanged read-only setting and leaves missing system unknown', () => {
    const current = room('20Gi');
    const form = { ...blankUpdateForm(current), changeReadOnly: true };
    expect(
      describeChanges(current, form).find((change) => change.field === 'readOnly')?.changed,
    ).toBe(false);
    expect(
      describeChanges({ ...current, system: '' }, form).find(
        (change) => change.field === 'readOnly',
      ),
    ).toMatchObject({ current: null, changed: true });
  });
});

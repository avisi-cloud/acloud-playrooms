import { vi } from 'vitest';

import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { PlayroomDefaultsService } from '../../../../core/services/playroom-defaults';
import { PlayroomLifecycleService } from '../../../../core/services/playroom-lifecycle';
import { PlayroomStateService } from '../../../../core/services/playroom-state';
import { UiSessionService } from '../../../../core/services/ui-session';
import { ToastService } from '../../../../core/services/toast';
import { wailsApi } from '../../../../core/services/wails-api';
import { blankCreateForm, readCache } from '../../../../shared/utils';
import { CreatePlayroomDrawerComponent } from './create-playroom-drawer';

function drawer() {
  return TestBed.createComponent(CreatePlayroomDrawerComponent).componentInstance;
}

/** What `playroom config` reports when the user has set these on the Defaults screen. */
async function configureDefaults(values: Record<string, string>): Promise<PlayroomDefaultsService> {
  vi.spyOn(wailsApi, 'getPlayroomDefaults').mockResolvedValue(
    Object.entries(values).map(([Key, Value]) => ({ Key, Value, Builtin: '', Source: 'config' })),
  );
  const defaults = TestBed.inject(PlayroomDefaultsService);
  await defaults.loadConfiguredDefaultsOnce();
  return defaults;
}

const DIND_IMAGE = {
  Name: 'claude-code-dind',
  Reference: 'registry/claude-code-dind:latest',
  Description: 'Docker',
  IsDefault: false,
  RequiresPrivileged: true,
};

describe('Create playroom drawer', () => {
  beforeEach(async () => {
    // An in-memory localStorage, so the remembered mode cannot leak between tests.
    let stored: string | null = null;
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => stored),
      setItem: vi.fn((_key: string, value: string) => {
        stored = value;
      }),
    });
    await TestBed.configureTestingModule({
      imports: [CreatePlayroomDrawerComponent],
      providers: [MessageService, provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // A blank profile leaves --capabilities off. Without an option for it, the
  // select rendered empty and a picked profile could not be undone.
  it('offers your default first, and has a hint for every profile', () => {
    const options = drawer().capabilitiesOptions;
    expect(options[0]).toMatchObject({ id: '', label: 'Your default' });
    expect(options.every((option) => option.hint.length > 0)).toBe(true);
  });

  it('goes from the image error to the Options step with the advanced section open', () => {
    const component = drawer();
    component.form.name = 'demo';
    component.goToPrivilegedModeOnOptionsStep();
    expect(component.stepKey()).toBe('options');
    expect(component.advancedSecurityOpenedFromImageError).toBe(true);
  });

  it('stays on Basics while the name is invalid, so the name error shows first', () => {
    const component = drawer();
    component.form.name = '';
    component.goToPrivilegedModeOnOptionsStep();
    expect(component.stepKey()).toBe('basics');
    expect(component.touched).toBe(true);
  });

  describe('Easy and Advanced', () => {
    it('opens in Easy mode when nothing is remembered', () => {
      expect(drawer().mode).toBe('easy');
    });

    it('renders Easy without steps, and Advanced with them and a way back', async () => {
      vi.spyOn(wailsApi, 'listPlayroomImages').mockResolvedValue([]);
      vi.spyOn(wailsApi, 'getPlayroomDefaults').mockResolvedValue([]);
      const fixture = TestBed.createComponent(CreatePlayroomDrawerComponent);
      fixture.componentRef.setInput('playhouse', 'playhouse-demo');
      fixture.componentRef.setInput('visible', true);
      fixture.detectChanges();
      await fixture.whenStable();
      const drawerText = () => document.body.textContent ?? '';

      expect(drawerText()).toContain('Show advanced options');
      expect(drawerText()).toContain('Everything else uses your defaults.');
      expect(document.body.querySelector('app-wizard-stepper')).toBeNull();

      fixture.componentInstance.switchToAdvancedMode();
      fixture.detectChanges();

      expect(document.body.querySelector('app-wizard-stepper')).not.toBeNull();
      expect(drawerText()).toContain('Back to easy mode');
      fixture.destroy();
    });

    it('remembers the chosen mode for the next time the drawer is made', () => {
      drawer().switchToAdvancedMode();
      expect(readCache().createPlayroomMode).toBe('advanced');
      expect(drawer().mode).toBe('advanced');

      drawer().switchToEasyMode();
      expect(drawer().mode).toBe('easy');
    });

    it('lands on Basics with everything filled in when switching to Advanced', () => {
      const component = drawer();
      component.form.name = 'demo';
      component.form.storage = '50Gi';
      component.step = 3;

      component.switchToAdvancedMode();

      expect(component.stepKey()).toBe('basics');
      expect(component.form.name).toBe('demo');
      expect(component.form.storage).toBe('50Gi');
    });

    it('keeps the form when going back to Easy', () => {
      const component = drawer();
      component.switchToAdvancedMode();
      component.form.env = ['ANTHROPIC_API_KEY'];

      component.switchToEasyMode();

      expect(component.form.env).toEqual(['ANTHROPIC_API_KEY']);
    });

    it('sends exactly the same input in both modes for the same form', () => {
      const component = drawer();
      component.form = {
        ...blankCreateForm('playhouse-demo'),
        name: 'demo',
        storage: '50Gi',
        env: ['ANTHROPIC_API_KEY'],
        ports: ['3000'],
        noWait: true,
        privileged: true,
        acknowledgePrivileged: true,
      };
      const inputInEasyMode = component.toInput();

      component.switchToAdvancedMode();

      expect(component.toInput()).toEqual(inputInEasyMode);
    });
  });

  describe('Size', () => {
    it('sets the four resource fields when a size is chosen', () => {
      const component = drawer();
      component.chooseSize('medium');
      expect(component.form).toMatchObject({
        cpuReq: '500m',
        cpuLim: '4',
        memReq: '4Gi',
        memLim: '4Gi',
      });
      expect(component.selectedSize()).toBe('medium');
    });

    it('reads a hand-edited value as Custom, and leaves it alone when Custom is chosen', () => {
      const component = drawer();
      component.chooseSize('small');
      component.form.cpuLim = '3';

      expect(component.selectedSize()).toBe('custom');
      component.chooseSize('custom');
      expect(component.form.cpuLim).toBe('3');
    });

    it('restores the values the form was seeded with when Your defaults is chosen', async () => {
      const defaults = await configureDefaults({ 'cpu-request': '1', 'memory-limit': '6Gi' });
      const component = drawer();
      component.form = blankCreateForm('playhouse-demo', defaults);
      expect(component.selectedSize()).toBe('defaults');

      component.chooseSize('large');
      component.chooseSize('defaults');

      expect(component.form).toMatchObject({ cpuReq: '1', memLim: '6Gi' });
      expect(component.selectedSize()).toBe('defaults');
    });
  });

  describe('advanced options changed from your defaults', () => {
    it('counts nothing on a form that is still on your defaults', () => {
      const component = drawer();
      component.form.name = 'demo';
      component.form.image = 'claude-code';
      component.chooseSize('large');
      expect(component.countAdvancedOptionsDifferentFromDefaults()).toBe(0);
    });

    it('counts every advanced option that will be sent differently', () => {
      const component = drawer();
      component.form.storage = '50Gi';
      component.form.env = ['ANTHROPIC_API_KEY'];
      component.form.noWait = true;
      expect(component.countAdvancedOptionsDifferentFromDefaults()).toBe(3);
    });

    it('does not count a change that sends nothing different', () => {
      const component = drawer();
      component.form.env = ['', ''];
      // Not sent until acknowledged; the acknowledgement is what blocks Create instead.
      component.form.privileged = true;
      expect(component.countAdvancedOptionsDifferentFromDefaults()).toBe(0);
    });
  });

  describe('NodePort SSH', () => {
    it('is sent for a playroom that is not a NodePort one', () => {
      const component = drawer();
      component.form.exposure = 'portforward';
      component.form.nodePortSSH = true;
      expect(component.toInput().NodePortSSH).toBe(true);
    });

    // acloud refuses --nodeport-ssh on a nodeport room, whose SSH already is one.
    it('is not sent for a NodePort playroom', () => {
      const component = drawer();
      component.form.exposure = 'nodeport';
      component.form.nodePortSSH = true;
      expect(component.toInput().NodePortSSH).toBe(false);
    });
  });

  describe('an image that needs privileged mode', () => {
    it('shows the error in Easy before anything is touched, with Create disabled', () => {
      const component = drawer();
      component.images = [DIND_IMAGE];
      component.form.name = 'demo';
      component.form.image = 'claude-code-dind';

      expect(component.touched).toBe(false);
      expect(component.imageErrorShown()).toContain('needs privileged mode');
      expect(component.canCreate()).toBe(false);
    });

    it('waits for Next on the Basics step, as before', () => {
      const component = drawer();
      component.switchToAdvancedMode();
      component.images = [DIND_IMAGE];
      component.form.name = 'demo';
      component.form.image = 'claude-code-dind';

      expect(component.imageErrorShown()).toBe('');
    });

    it('switches from Easy to the privileged toggle on the Options step', () => {
      const component = drawer();
      component.images = [DIND_IMAGE];
      component.form.name = 'demo';
      component.form.image = 'claude-code-dind';

      component.goToPrivilegedModeOnOptionsStep();

      expect(component.mode).toBe('advanced');
      expect(component.stepKey()).toBe('options');
      expect(component.advancedSecurityOpenedFromImageError).toBe(true);
    });
  });

  it('creates from Easy with the name, image and size, and your defaults for the rest', async () => {
    const defaults = await configureDefaults({
      storage: '50Gi',
      'ssh-key': '~/.ssh/work',
      'proxy-group': 'team',
      'read-only': 'false',
      capabilities: 'standard',
      'workspace-namespace': 'true',
      'wait-timeout': '30m',
    });
    TestBed.inject(PlayroomStateService).selectPlayhouse('playhouse-demo');
    vi.spyOn(TestBed.inject(PlayroomLifecycleService), 'reload').mockResolvedValue([]);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const createPlayroom = vi.spyOn(wailsApi, 'createPlayroom').mockResolvedValue(undefined);

    const component = drawer();
    component.form = blankCreateForm('playhouse-demo', defaults);
    component.form.name = 'demo';
    component.form.image = 'claude-code';
    component.chooseSize('small');
    expect(component.mode).toBe('easy');
    await component.create();

    expect(createPlayroom).toHaveBeenCalledWith(expect.any(String), {
      Name: 'demo',
      Playhouse: 'playhouse-demo',
      Image: 'claude-code',
      Storage: '50Gi',
      CPURequest: '250m',
      CPULimit: '2',
      MemoryRequest: '2Gi',
      MemoryLimit: '2Gi',
      SSHKey: '~/.ssh/work',
      EnvVars: [],
      GitRepos: [],
      Copies: [],
      Ports: [],
      ProxyGroup: 'team',
      Exposure: '',
      NodePortSSH: false,
      Capabilities: 'standard',
      CapAdd: [],
      Ephemeral: false,
      ReadOnly: false,
      Privileged: false,
      WorkspaceNamespace: true,
      NoWait: false,
      WaitTimeout: '30m',
      ForceInstall: false,
    });
  });

  it('closes before creation finishes, survives destruction and keeps navigation where it is', async () => {
    TestBed.inject(PlayroomStateService).selectPlayhouse('playhouse-demo');
    const actions = TestBed.inject(PlayroomLifecycleService);
    TestBed.tick();
    vi.spyOn(actions, 'reload').mockResolvedValue([]);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    const toast = vi.spyOn(TestBed.inject(ToastService), 'toast');
    let finishCommand = () => {};
    vi.spyOn(wailsApi, 'createPlayroom').mockReturnValue(
      new Promise<void>((resolve) => {
        finishCommand = resolve;
      }),
    );
    const fixture = TestBed.createComponent(CreatePlayroomDrawerComponent);
    const component = fixture.componentInstance;
    component.form = { ...blankCreateForm('playhouse-demo'), name: 'demo' };
    component.visible = true;
    const visibleChange = vi.fn();
    component.visibleChange.subscribe(visibleChange);

    component.create();

    expect(component.visible).toBe(false);
    expect(visibleChange).toHaveBeenCalledWith(false);
    expect(actions.pendingOperation('demo')).toBe('Creating');
    expect(TestBed.inject(UiSessionService).recall('create')).toMatchObject({
      form: { name: 'demo' },
    });
    fixture.destroy();
    finishCommand();
    await vi.waitFor(() => expect(actions.pendingOperation('demo')).toBe(''));
    expect(toast).toHaveBeenCalledWith('Created "demo"', 'ok', expect.any(String));
    expect(TestBed.inject(UiSessionService).recall('create')).toBeUndefined();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('allows dismissal while the same room is still being created', async () => {
    TestBed.inject(PlayroomStateService).selectPlayhouse('playhouse-demo');
    const actions = TestBed.inject(PlayroomLifecycleService);
    TestBed.tick();
    vi.spyOn(actions, 'reload').mockResolvedValue([]);
    let finishCommand = () => {};
    vi.spyOn(wailsApi, 'createPlayroom').mockReturnValue(
      new Promise<void>((resolve) => {
        finishCommand = resolve;
      }),
    );
    const component = drawer();
    component.form = { ...blankCreateForm('playhouse-demo'), name: 'demo' };
    actions.startCreate(component.form);
    component.visible = true;
    expect(component.submitting).toBe(true);
    component.close();
    expect(component.visible).toBe(false);
    finishCommand();
    await vi.waitFor(() => expect(actions.pendingOperation('demo')).toBe(''));
  });
});

import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { PlayroomLifecycleService } from '../../../core/services/playroom-lifecycle';
import { DEFAULTS } from '../../data';
import { Playroom } from '../../models';
import { PlayroomActionsHostComponent } from './playroom-actions-host';

const room: Playroom = {
  name: 'demo',
  owner: 'me',
  status: 'ready',
  rawStatus: '',
  ageMin: 1,
  disk: '10Gi',
  diskType: 'persistent',
  host: 'demo.example',
  image: 'default',
  cpuReq: '1',
  cpuLim: '2',
  memReq: '1Gi',
  memLim: '2Gi',
  ports: '',
  system: 'writable',
  playhouse: 'playhouse-demo',
  ephemeral: false,
  env: [],
  git: [],
  copy: [],
};

describe('PlayroomActionsHostComponent', () => {
  const lifecycle = { delete: vi.fn() };

  afterEach(() => vi.unstubAllGlobals());

  beforeEach(() => {
    lifecycle.delete.mockReset();
    TestBed.configureTestingModule({
      imports: [PlayroomActionsHostComponent],
      providers: [MessageService, { provide: PlayroomLifecycleService, useValue: lifecycle }],
    });
  });

  function create(): PlayroomActionsHostComponent {
    return TestBed.createComponent(PlayroomActionsHostComponent).componentInstance;
  }

  it('owns connect and update visibility for the selected room', () => {
    const host = create();
    host.openConnect(room, 'open');
    expect(host.room).toBe(room);
    expect(host.connectTab).toBe('open');
    expect(host.isOpen()).toBe(true);

    host.close();
    host.openUpdate(room);
    expect(host.showUpdate).toBe(true);
  });

  it('resets and maps every delete option on open', () => {
    const host = create();
    host.deleteNoWait = true;
    host.deleteForce = true;
    host.deleteTimeout = '99m';
    host.openDelete(room);

    expect(host.deleteInput()).toEqual({
      Name: 'demo',
      Playhouse: 'playhouse-demo',
      NoWait: false,
      Force: false,
      WaitTimeout: DEFAULTS.waitTimeout,
    });
  });

  it('emits only after successful deletion', async () => {
    const host = create();
    const emitted = vi.fn();
    host.deleted.subscribe(emitted);
    host.openDelete(room);

    lifecycle.delete.mockResolvedValueOnce(false);
    await host.confirmDelete();
    expect(emitted).not.toHaveBeenCalled();

    lifecycle.delete.mockResolvedValueOnce(true);
    await host.confirmDelete();
    expect(emitted).toHaveBeenCalledWith(room);
  });

  it('clears a deleted room from the remembered cache', async () => {
    let stored = JSON.stringify({ lastPlayroom: room.name });
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => stored),
      setItem: vi.fn((_key: string, value: string) => {
        stored = value;
      }),
    });
    const host = create();
    host.openDelete(room);
    lifecycle.delete.mockResolvedValueOnce(true);

    await host.confirmDelete();

    expect(JSON.parse(stored).lastPlayroom).toBe('');
  });
});

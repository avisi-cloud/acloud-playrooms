import { TestBed } from '@angular/core/testing';
import { Playroom } from '../../models';
import { PlayroomCardComponent } from './playroom-card';

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
  capabilityProfile: 'minimal',
  capabilityAdditions: [],
  outdated: false,
  playhouse: 'playhouse-demo',
  ephemeral: false,
  env: [],
  git: [],
  copy: [],
};

describe('PlayroomCardComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PlayroomCardComponent] }).compileComponents();
  });

  it('emits the connect action without opening the card', () => {
    const fixture = TestBed.createComponent(PlayroomCardComponent);
    const component = fixture.componentInstance;
    component.room = room;
    const openRoom = vi.fn();
    const connectRoom = vi.fn();
    component.openRoom.subscribe(openRoom);
    component.connectRoom.subscribe(connectRoom);
    fixture.detectChanges();

    const connect = fixture.nativeElement.querySelector(
      '[aria-label="Connect to playroom demo"]',
    ) as HTMLElement;
    connect.click();

    expect(connectRoom).toHaveBeenCalledWith('demo');
    expect(openRoom).not.toHaveBeenCalled();
  });

  it('opens Update from the outdated badge without opening the card', () => {
    const fixture = TestBed.createComponent(PlayroomCardComponent);
    const component = fixture.componentInstance;
    component.room = { ...room, outdated: true };
    const openRoom = vi.fn();
    const editRoom = vi.fn();
    component.openRoom.subscribe(openRoom);
    component.editRoom.subscribe(editRoom);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('button.card-outdated') as HTMLElement).click();

    expect(editRoom).toHaveBeenCalledWith('demo');
    expect(openRoom).not.toHaveBeenCalled();
  });

  // playroom update refuses a disposable room, so its badge is not a button.
  it('shows an outdated disposable room without offering Update', () => {
    const fixture = TestBed.createComponent(PlayroomCardComponent);
    fixture.componentInstance.room = { ...room, outdated: true, ephemeral: true };
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('button.card-outdated')).toBeNull();
    expect(fixture.nativeElement.querySelector('.card-outdated')?.textContent).toContain(
      'Recreate to update',
    );
  });
});

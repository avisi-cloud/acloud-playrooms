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
});

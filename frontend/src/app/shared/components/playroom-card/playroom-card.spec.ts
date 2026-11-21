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
  afterEach(() => vi.useRealTimers());

  it('opens details on a single click and cancels navigation for a double click', async () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(PlayroomCardComponent);
    fixture.componentInstance.room = room;
    const open = vi.fn();
    const doubleClick = vi.fn();
    fixture.componentInstance.openRoom.subscribe(open);
    fixture.componentInstance.doubleClickRoom.subscribe(doubleClick);
    fixture.detectChanges();
    const card = fixture.nativeElement.querySelector('article') as HTMLElement;
    card.click();
    await vi.advanceTimersByTimeAsync(500);
    expect(open).toHaveBeenCalledOnce();
    open.mockClear();
    card.click();
    card.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }));
    card.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(500);
    expect(open).not.toHaveBeenCalled();
    expect(doubleClick).toHaveBeenCalledExactlyOnceWith('demo');
  });

  it('ignores double clicks on controls, unavailable rooms and pending operations', () => {
    const fixture = TestBed.createComponent(PlayroomCardComponent);
    const component = fixture.componentInstance;
    component.room = room;
    const doubleClick = vi.fn();
    component.doubleClickRoom.subscribe(doubleClick);
    fixture.detectChanges();
    fixture.nativeElement
      .querySelector('p-button')
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const card = fixture.nativeElement.querySelector('article');
    component.pendingOperation = 'Stopping';
    card.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    component.pendingOperation = '';
    component.room = { ...room, status: 'stopped' };
    card.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(doubleClick).not.toHaveBeenCalled();
  });

  it('copies the SSH alias from the menu and shows Copied', async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { userAgent: navigator.userAgent, clipboard: { writeText: copy } });
    try {
      const fixture = TestBed.createComponent(PlayroomCardComponent);
      fixture.componentInstance.room = room;
      await fixture.componentInstance.copySshCommand();
      expect(copy).toHaveBeenCalledWith('ssh playroom-demo');
      expect(fixture.componentInstance.menuItems().some((item) => item.label === 'Copied')).toBe(
        true,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('emits pin changes without opening the card and exposes its pressed state', async () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(PlayroomCardComponent);
    fixture.componentInstance.room = { ...room, status: 'stopped' };
    const pin = vi.fn();
    const open = vi.fn();
    fixture.componentInstance.pinRoom.subscribe(pin);
    fixture.componentInstance.openRoom.subscribe(open);
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector('[aria-label="Pin playroom demo"]') as HTMLButtonElement
    ).click();
    await vi.advanceTimersByTimeAsync(500);
    expect(pin).toHaveBeenCalledExactlyOnceWith('demo');
    expect(open).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('article.stopped')).not.toBeNull();
    fixture.componentRef.setInput('pinned', true);
    fixture.detectChanges();
    expect(
      fixture.nativeElement
        .querySelector('[aria-label="Unpin playroom demo"]')
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });
});

describe('Create similar card action', () => {
  it('emits the source room name from the overflow menu', () => {
    const fixture = TestBed.createComponent(PlayroomCardComponent);
    fixture.componentRef.setInput('room', room);
    const component = fixture.componentInstance;
    const emitted = vi.fn();
    component.createSimilarRoom.subscribe(emitted);
    component
      .menuItems()
      .find((item) => item.label === 'Create similar')
      ?.command?.({});
    expect(emitted).toHaveBeenCalledWith(room.name);
  });
});

describe('Card selection', () => {
  it('selects on Command-click, Shift-click and keyboard without opening details', async () => {
    vi.useFakeTimers();
    try {
      const fixture = TestBed.createComponent(PlayroomCardComponent);
      fixture.componentRef.setInput('room', room);
      fixture.componentRef.setInput('currentUser', 'me');
      const component = fixture.componentInstance;
      const select = vi.fn();
      const open = vi.fn();
      component.selectRoom.subscribe(select);
      component.openRoom.subscribe(open);
      fixture.detectChanges();
      const card = fixture.nativeElement.querySelector('article');
      card.dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: true }));
      expect(select).toHaveBeenLastCalledWith({ name: 'demo', shiftKey: false });
      card.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
      expect(select).toHaveBeenLastCalledWith({ name: 'demo', shiftKey: true });
      fixture.componentRef.setInput('selectMode', true);
      fixture.detectChanges();
      card.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      expect(select).toHaveBeenCalledTimes(3);
      const checkbox = fixture.nativeElement.querySelector(
        'input[type=checkbox]',
      ) as HTMLInputElement;
      checkbox.click();
      expect(select).toHaveBeenCalledTimes(4);
      await vi.advanceTimersByTimeAsync(500);
      expect(open).not.toHaveBeenCalled();
      fixture.componentRef.setInput('currentUser', 'someone-else');
      fixture.detectChanges();
      expect(checkbox.disabled).toBe(true);
      card.click();
      expect(select).toHaveBeenCalledTimes(4);
      fixture.destroy();
    } finally {
      vi.useRealTimers();
    }
  });
});

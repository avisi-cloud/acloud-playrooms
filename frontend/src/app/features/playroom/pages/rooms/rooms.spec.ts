import { vi } from 'vitest';

import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { RoomsPageComponent } from './rooms';
import { PlayroomStateService } from '../../../../core/services/playroom-state';
import { ListingDto } from '../../../../shared/models';
import { wailsApi } from '../../../../core/services/wails-api';

/**
 * The rooms on screen must always belong to the playhouse in the sidebar, in
 * both the cases that used to come apart.
 */
describe('RoomsPageComponent', () => {
  let listPlayrooms: ReturnType<typeof vi.fn>;

  const roomsIn = (playhouse: string): ListingDto[] => [
    { Name: `${playhouse}-room`, Owner: 'sem@avisi.nl', Status: 'Running' },
  ];

  beforeEach(async () => {
    vi.spyOn(wailsApi, 'getCurrentUserEmail').mockResolvedValue('sem@avisi.nl');
    listPlayrooms = vi
      .spyOn(wailsApi, 'listPlayrooms')
      .mockImplementation((input) => Promise.resolve(roomsIn(input.Playhouse ?? '')));

    await TestBed.configureTestingModule({
      imports: [RoomsPageComponent],
      providers: [MessageService, provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => vi.restoreAllMocks());

  /** The playhouses each `playroom list` was asked for, in order. */
  const playhousesRead = (): (string | undefined)[] =>
    listPlayrooms.mock.calls.map(
      (call: unknown[]) => (call[0] as { Playhouse?: string }).Playhouse,
    );

  it('reads the rooms once when the screen opens', async () => {
    TestBed.inject(PlayroomStateService).selectPlayhouse('playhouse-a');

    const fixture = TestBed.createComponent(RoomsPageComponent);
    await fixture.whenStable();

    expect(playhousesRead()).toEqual(['playhouse-a']);
  });

  it('reads them again for a playhouse chosen while it is already open', async () => {
    const state = TestBed.inject(PlayroomStateService);
    state.selectPlayhouse('playhouse-a');
    const fixture = TestBed.createComponent(RoomsPageComponent);
    await fixture.whenStable();

    // What the sidebar does: no navigation, because this is the route it is on.
    state.selectPlayhouse('playhouse-b');
    await fixture.whenStable();

    expect(playhousesRead()).toEqual(['playhouse-a', 'playhouse-b']);
    expect(state.rooms().every((room) => room.playhouse === 'playhouse-b')).toBe(true);
  });

  it('still reads the playhouse chosen before the previous read landed', async () => {
    let finishTheFirstRead = (_: ListingDto[]) => {};
    listPlayrooms.mockImplementationOnce(
      () => new Promise<ListingDto[]>((resolve) => (finishTheFirstRead = resolve)),
    );

    const state = TestBed.inject(PlayroomStateService);
    state.selectPlayhouse('playhouse-a');
    const fixture = TestBed.createComponent(RoomsPageComponent);
    TestBed.tick();

    state.selectPlayhouse('playhouse-b');
    finishTheFirstRead(roomsIn('playhouse-a'));
    await fixture.whenStable();

    expect(playhousesRead()).toEqual(['playhouse-a', 'playhouse-b']);
    expect(state.roomsLoadedFor()).toBe('playhouse-b');
  });

  it('drops a poll that ticks while a read is already running', async () => {
    const state = TestBed.inject(PlayroomStateService);
    state.selectPlayhouse('playhouse-a');
    const fixture = TestBed.createComponent(RoomsPageComponent);
    const page = fixture.componentInstance;

    let finishTheFirstRead = (_: ListingDto[]) => {};
    listPlayrooms.mockImplementationOnce(
      () => new Promise<ListingDto[]>((resolve) => (finishTheFirstRead = resolve)),
    );
    TestBed.tick();

    void page.refreshRooms(true);
    finishTheFirstRead(roomsIn('playhouse-a'));
    await fixture.whenStable();

    expect(playhousesRead()).toEqual(['playhouse-a']);
  });
});

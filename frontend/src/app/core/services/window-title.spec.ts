import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { Router, TitleStrategy, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { WindowTitleStrategy } from './window-title';
import { PlayroomStateService } from './playroom-state';
import { wailsApi } from './wails-api';

@Component({ template: '' })
class EmptyPage {}

describe('WindowTitleStrategy', () => {
  beforeEach(() => {
    vi.spyOn(wailsApi, 'setWindowTitle').mockResolvedValue();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'rooms', title: 'Playrooms', component: EmptyPage },
          { path: 'rooms/:name', title: 'Playrooms', component: EmptyPage },
          { path: 'settings', title: 'Settings', component: EmptyPage },
          { path: 'playhouse', title: 'Playhouses', component: EmptyPage },
          { path: 'defaults', title: 'Defaults', component: EmptyPage },
        ]),
        { provide: TitleStrategy, useClass: WindowTitleStrategy },
      ],
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('sets browser and native titles for every screen', async () => {
    TestBed.inject(PlayroomStateService).selectPlayhouse('demo');
    for (const [path, title] of [
      ['/rooms', 'Playrooms — demo'],
      ['/rooms/demo', 'demo — Playrooms'],
      ['/settings', 'Settings'],
      ['/playhouse', 'Playhouses'],
      ['/defaults', 'Defaults'],
    ]) {
      await TestBed.inject(Router).navigateByUrl(path);
      expect(document.title).toBe(title);
      expect(wailsApi.setWindowTitle).toHaveBeenLastCalledWith(title);
    }
  });

  it('updates a reused list title when the selected playhouse changes', async () => {
    const state = TestBed.inject(PlayroomStateService);
    state.selectPlayhouse('');
    await TestBed.inject(Router).navigateByUrl('/rooms');
    expect(document.title).toBe('Playrooms');
    state.selectPlayhouse('demo');
    TestBed.tick();
    expect(document.title).toBe('Playrooms — demo');
  });
});

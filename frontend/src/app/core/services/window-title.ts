import { Injectable, effect, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { PlayroomStateService } from './playroom-state';
import { wailsApi } from './wails-api';

@Injectable()
export class WindowTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly state = inject(PlayroomStateService);
  private snapshot?: RouterStateSnapshot;

  constructor() {
    super();
    effect(() => {
      this.state.playhouse();
      if (this.snapshot) this.updateTitle(this.snapshot);
    });
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.snapshot = snapshot;
    let route = snapshot.root;
    while (route.firstChild) route = route.firstChild;
    const screen = this.buildTitle(snapshot) ?? 'Acloud Playrooms';
    const room = route.paramMap.get('name');
    const title = room
      ? `${room} — Playrooms`
      : screen === 'Playrooms' && this.state.playhouse()
        ? `Playrooms — ${this.state.playhouse()}`
        : screen;
    this.title.setTitle(title);
    void wailsApi
      .setWindowTitle(title)
      .catch((error: unknown) => console.error('Could not set window title', error));
  }
}

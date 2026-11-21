import { DestroyRef, Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CONNECT_PLAYROOM_QUERY_PARAM, CREATE_PLAYROOM_QUERY_PARAM } from '../../shared/data';
import { parseDeepLink } from '../../shared/utils/deep-link';
import { PlayroomStateService } from './playroom-state';
import { ScopeService } from './scope';
import { ToastService } from './toast';
import { wailsApi } from './wails-api';

@Injectable({ providedIn: 'root' })
export class DeepLinksService {
  private readonly router = inject(Router);
  private readonly state = inject(PlayroomStateService);
  private readonly scope = inject(ScopeService);
  private readonly notify = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private started = false;
  private request = 0;

  start(): void {
    if (this.started || this.destroyRef.destroyed) return;
    this.started = true;
    this.destroyRef.onDestroy(wailsApi.onDeepLink((url) => void this.open(url)));
  }

  async open(url: string): Promise<void> {
    const request = ++this.request;
    const selection = this.state.captureSelection();
    try {
      const link = parseDeepLink(url);
      if (this.scope.switching())
        throw new Error(
          'Wait for the context or organisation switch to finish, then open the link again.',
        );
      const [context, organisation, playhouses] = await Promise.all([
        wailsApi.getCurrentContext(),
        wailsApi.getCurrentOrganisation(),
        wailsApi.listPlayhouses(),
      ]);
      if (request !== this.request || this.destroyRef.destroyed) return;
      if (
        !this.state.isCurrentSelection(selection) ||
        this.scope.switching() ||
        context !== this.scope.currentContext() ||
        organisation !== this.scope.currentOrganisation()
      )
        throw new Error('The current selection changed. Open the link again.');
      if (
        !context ||
        !organisation ||
        !playhouses.some((playhouse) => playhouse.Slug === link.playhouse)
      )
        throw new Error(
          `Playhouse "${link.playhouse}" is not available in the current context and organisation. Choose the scope yourself, then open the link again.`,
        );
      this.state.selectPlayhouse(link.playhouse);
      await this.router.navigate(link.action === 'create' ? ['/rooms'] : ['/rooms', link.room], {
        queryParams:
          link.action === 'create'
            ? { [CREATE_PLAYROOM_QUERY_PARAM]: '1' }
            : link.action === 'connect'
              ? { [CONNECT_PLAYROOM_QUERY_PARAM]: '1' }
              : {},
      });
    } catch (error) {
      if (request === this.request) this.notify.failure('Could not open link', error);
    }
  }
}

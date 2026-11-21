import { Injectable, effect, inject, signal } from '@angular/core';
import { PlayroomSort, PlayroomView, StatusKey } from '../../shared/models';
import { readCache, updateCache } from '../../shared/utils/cache';
import { PlayroomStateService } from './playroom-state';

/** Navigation and drafts stay in memory; only explicit overview preferences enter the cache. */
@Injectable({ providedIn: 'root' })
export class UiSessionService {
  private readonly state = inject(PlayroomStateService);
  private readonly drafts = new Map<string, { contents: unknown; revision: number }>();
  private nextDraftRevision = 0;
  readonly query = signal('');
  readonly mineOnly = signal(false);
  readonly status = signal<StatusKey | ''>('');
  readonly sort = signal<PlayroomSort>('name');
  readonly playroomView = signal<PlayroomView>(readCache().playroomView);
  readonly groupByOwner = signal(readCache().groupByOwner);
  scrollTop = 0;

  constructor() {
    effect(() => {
      this.state.scopeRevision();
      this.state.playhouse();
      this.drafts.clear();
      this.query.set('');
      this.mineOnly.set(false);
      this.status.set('');
      this.sort.set('name');
      this.scrollTop = 0;
    });
  }

  setPlayroomView(playroomView: PlayroomView): void {
    this.playroomView.set(playroomView);
    updateCache({ playroomView });
  }

  setGroupByOwner(groupByOwner: boolean): void {
    this.groupByOwner.set(groupByOwner);
    updateCache({ groupByOwner });
  }

  remember<T>(key: string, draft: T): void {
    this.drafts.set(key, { contents: structuredClone(draft), revision: ++this.nextDraftRevision });
  }
  recall<T>(key: string): T | undefined {
    const draft = this.drafts.get(key);
    return draft === undefined ? undefined : (structuredClone(draft.contents) as T);
  }
  forget(key: string): void {
    this.drafts.delete(key);
  }

  draftRevision(key: string): number | undefined {
    return this.drafts.get(key)?.revision;
  }

  forgetSubmittedDraft(key: string, submittedRevision: number | undefined): void {
    if (submittedRevision !== undefined && this.draftRevision(key) === submittedRevision)
      this.forget(key);
  }
}

import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ListboxModule } from 'primeng/listbox';
import { TagModule } from 'primeng/tag';
import { MessageModule } from 'primeng/message';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ScopeService, ScopeSwitchResult } from '../../../../core/services/scope';
import { PlayroomStateService } from '../../../../core/services/playroom-state';
import { AcloudSessionService } from '../../../../core/services/acloud-session';
import {
  ContextEntry,
  OrganisationEntry,
  PlayhouseEntry,
  wailsApi,
} from '../../../../core/services/wails-api';
import { OverlayFocusDirective } from '../../../../shared/directives';
import { describeError } from '../../../../shared/utils/cli-error';

@Component({
  selector: 'app-playhouse-chooser',
  imports: [
    FormsModule,
    DialogModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    ListboxModule,
    TagModule,
    MessageModule,
    IconFieldModule,
    InputIconModule,
    OverlayFocusDirective,
  ],
  templateUrl: './playhouse-chooser.html',
  styleUrl: './playhouse-chooser.css',
})
export class PlayhouseChooserComponent implements OnChanges, OnDestroy {
  readonly scope = inject(ScopeService);
  readonly state = inject(PlayroomStateService);
  private readonly session = inject(AcloudSessionService);
  private readonly router = inject(Router);

  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();

  readonly contexts = signal<ContextEntry[]>([]);
  readonly organisations = signal<OrganisationEntry[]>([]);
  readonly playhouses = signal<PlayhouseEntry[]>([]);
  readonly selectedSlug = signal('');
  readonly query = signal('');
  readonly loading = signal(false);
  readonly loadingScopes = signal(false);
  readonly changingScope = signal(false);
  readonly failure = signal('');
  readonly scopeFailure = signal('');
  readonly switchFailure = signal('');
  private listSequence = 0;
  private scopeSequence = 0;
  private destroyed = false;

  readonly organisationOptions = computed(() =>
    this.organisations().map((organisation) => ({
      ...organisation,
      displayName: organisation.Name || organisation.Slug,
    })),
  );

  readonly currentOrganisationName = computed(() => {
    const slug = this.scope.currentOrganisation();
    return this.organisations().find((organisation) => organisation.Slug === slug)?.Name || slug;
  });
  readonly filteredPlayhouses = computed(() => {
    const query = this.query().trim().toLowerCase();
    const current = this.state.playhouse();
    return this.playhouses()
      .filter((playhouse) => `${playhouse.Slug} ${playhouse.Region}`.toLowerCase().includes(query))
      .sort(
        (first, second) =>
          Number(second.Slug === current) - Number(first.Slug === current) ||
          first.Slug.localeCompare(second.Slug),
      );
  });
  readonly selectedPlayhouse = computed(() =>
    this.playhouses().find((playhouse) => playhouse.Slug === this.selectedSlug()),
  );

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['visible']) return;
    if (this.visible) {
      this.query.set('');
      this.selectedSlug.set(this.state.playhouse());
      this.switchFailure.set('');
      void this.loadScopeChoices();
      void this.refreshPlayhouses();
    } else {
      this.listSequence++;
      this.scopeSequence++;
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.listSequence++;
    this.scopeSequence++;
  }

  async loadScopeChoices(): Promise<void> {
    const sequence = ++this.scopeSequence;
    const revision = this.state.scopeRevision();
    this.loadingScopes.set(true);
    this.scopeFailure.set('');
    this.contexts.set([]);
    this.organisations.set([]);
    try {
      const [contexts, organisations] = await Promise.all([
        wailsApi.listContexts(),
        wailsApi.listOrganisations(),
      ]);
      if (
        this.destroyed ||
        sequence !== this.scopeSequence ||
        revision !== this.state.scopeRevision()
      )
        return;
      this.contexts.set(contexts);
      this.organisations.set(organisations);
    } catch (error) {
      if (
        !this.destroyed &&
        sequence === this.scopeSequence &&
        revision === this.state.scopeRevision()
      )
        this.scopeFailure.set(describeError(error));
    } finally {
      if (!this.destroyed && sequence === this.scopeSequence) this.loadingScopes.set(false);
    }
  }

  async refreshPlayhouses(): Promise<void> {
    const sequence = ++this.listSequence;
    const revision = this.state.scopeRevision();
    this.loading.set(true);
    this.failure.set('');
    this.playhouses.set([]);
    try {
      const playhouses = await wailsApi.listPlayhouses();
      if (
        this.destroyed ||
        sequence !== this.listSequence ||
        revision !== this.state.scopeRevision()
      )
        return;
      this.playhouses.set(playhouses);
      if (!playhouses.some((playhouse) => playhouse.Slug === this.selectedSlug()))
        this.selectedSlug.set('');
    } catch (error) {
      if (
        !this.destroyed &&
        sequence === this.listSequence &&
        revision === this.state.scopeRevision()
      )
        this.failure.set(describeError(error));
    } finally {
      if (!this.destroyed && sequence === this.listSequence) this.loading.set(false);
    }
  }

  async switchOrganisation(slug: string): Promise<void> {
    if (!slug || slug === this.scope.currentOrganisation()) return;
    await this.changeScope(() => this.scope.switchToOrganisation(slug));
  }

  async switchContext(name: string): Promise<void> {
    if (!name || name === this.scope.currentContext()) return;
    await this.changeScope(() => this.scope.switchToContext(name));
  }

  private async changeScope(switchScope: () => Promise<ScopeSwitchResult | null>): Promise<void> {
    if (this.changingScope() || this.scope.switching()) return;
    this.changingScope.set(true);
    this.switchFailure.set('');
    this.listSequence++;
    this.scopeSequence++;
    try {
      const result = await switchScope();
      if (!result || !result.succeeded) {
        if (result) this.switchFailure.set(describeError(result.errorMessage));
        if (!this.destroyed) await Promise.all([this.loadScopeChoices(), this.refreshPlayhouses()]);
        return;
      }
      this.selectedSlug.set('');
      this.query.set('');
      this.playhouses.set([]);
      await this.router.navigate(['/playhouse']);
      if (this.destroyed) return;
      void this.session.refreshSignedInUser();
      await Promise.all([this.loadScopeChoices(), this.refreshPlayhouses()]);
    } catch (error) {
      if (!this.destroyed) this.switchFailure.set(describeError(error));
    } finally {
      if (!this.destroyed) {
        this.changingScope.set(false);
        this.loading.set(false);
        this.loadingScopes.set(false);
      }
    }
  }

  close(): void {
    if (this.changingScope()) return;
    this.listSequence++;
    this.scopeSequence++;
    this.visible = false;
    this.visibleChange.emit(false);
  }

  openPlayhouse(): void {
    const selected = this.selectedPlayhouse();
    if (!selected || this.loading() || this.changingScope() || this.scope.switching()) return;
    this.state.selectPlayhouse(selected.Slug);
    this.close();
    void this.router.navigate(['/rooms']);
  }

  managePlayhouses(): void {
    if (this.changingScope()) return;
    this.close();
    void this.router.navigate(['/playhouse']);
  }
}

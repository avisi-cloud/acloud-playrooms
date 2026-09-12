import { Injectable, inject, signal } from '@angular/core';
import { CliConsoleService } from './cli-console';
import { PlayroomStateService } from './playroom-state';
import { ContextEntry, OrganisationEntry, PlayhouseEntry, wailsApi } from './wails-api';

/** What a finished scope switch tells the shell, so it can report it. */
export interface ScopeSwitchResult {
  succeeded: boolean;
  /** The activity-log entry for the switch, so a toast can link to it. */
  operationId: string;
  /** Empty when the switch succeeded. */
  errorMessage: string;
}

/**
 * The top of the sidebar hierarchy: which context and organisation the CLI is
 * pointed at, and the playhouses inside the current one.
 */
@Injectable({ providedIn: 'root' })
export class ScopeService {
  private readonly state = inject(PlayroomStateService);
  private readonly console = inject(CliConsoleService);

  private readonly _contexts = signal<ContextEntry[]>([]);
  private readonly _currentContext = signal<string>('');
  private readonly _organisations = signal<OrganisationEntry[]>([]);
  private readonly _currentOrganisation = signal<string>('');
  private readonly _playhouses = signal<PlayhouseEntry[]>([]);
  private readonly _loadingPlayhouses = signal<boolean>(false);
  private readonly _switching = signal<boolean>(false);

  readonly contexts = this._contexts.asReadonly();
  readonly currentContext = this._currentContext.asReadonly();
  readonly organisations = this._organisations.asReadonly();
  readonly currentOrganisation = this._currentOrganisation.asReadonly();
  readonly playhouses = this._playhouses.asReadonly();
  readonly loadingPlayhouses = this._loadingPlayhouses.asReadonly();
  readonly switching = this._switching.asReadonly();

  /**
   * Reads the current context and organisation, plus the lists to switch
   * between. Always both: the organisation list depends on the context.
   */
  async loadContextAndOrganisation(): Promise<void> {
    const [context, organisation] = await Promise.all([
      wailsApi.getCurrentContext().catch(() => ''),
      wailsApi.getCurrentOrganisation().catch(() => ''),
    ]);
    this._currentContext.set(context);
    this._currentOrganisation.set(organisation);

    const [contexts, organisations] = await Promise.all([
      wailsApi.listContexts().catch(() => []),
      wailsApi.listOrganisations().catch(() => []),
    ]);
    this._contexts.set(contexts);
    this._organisations.set(organisations);
  }

  /**
   * Re-reads the playhouses behind the sidebar menu, which cannot trust what it
   * last saw. A failure keeps whatever it had.
   */
  async loadPlayhousesForMenu(): Promise<void> {
    if (this._loadingPlayhouses()) return;
    this._loadingPlayhouses.set(true);
    try {
      this._playhouses.set(await wailsApi.listPlayhouses());
    } catch {
      /* the menu keeps what it had */
    } finally {
      this._loadingPlayhouses.set(false);
    }
  }

  async switchToOrganisation(slug: string): Promise<ScopeSwitchResult | null> {
    if (!slug || slug === this._currentOrganisation()) return null;
    return this.runScopeSwitch('Organisation switched', slug, (operationId) =>
      wailsApi.switchOrganisation(operationId, slug),
    );
  }

  async switchToContext(name: string): Promise<ScopeSwitchResult | null> {
    if (!name || name === this._currentContext()) return null;
    return this.runScopeSwitch('Context switched', name, (operationId) =>
      wailsApi.switchContext(operationId, name),
    );
  }

  /**
   * Runs the switch, then drops everything belonging to the scope being left.
   * Both scopes are read back: a context carries its own organisation.
   */
  private async runScopeSwitch(
    summary: string,
    target: string,
    runCommand: (operationId: string) => Promise<void>,
  ): Promise<ScopeSwitchResult> {
    this._switching.set(true);
    let startedOperationId = '';
    try {
      await this.console.run(`${summary}: ${target}`, (operationId) => {
        startedOperationId = operationId;
        return runCommand(operationId);
      });
      this.forgetEverythingBelongingToPreviousScope();
      await this.loadContextAndOrganisation();
      return { succeeded: true, operationId: startedOperationId, errorMessage: '' };
    } catch (error) {
      return { succeeded: false, operationId: startedOperationId, errorMessage: String(error) };
    } finally {
      this._switching.set(false);
    }
  }

  /**
   * Drops every piece of state that belonged to the context, organisation or
   * session just left. `noteScopeChange` reaches a screen already open.
   */
  forgetEverythingBelongingToPreviousScope(): void {
    this.state.selectPlayhouse('');
    this.state.setRooms([]);
    this.state.setRoomsCount(0);
    this._playhouses.set([]);
    this.state.noteScopeChange();
  }
}

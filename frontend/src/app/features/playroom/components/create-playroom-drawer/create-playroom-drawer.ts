import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { CliConsoleService } from '../../../../core/services/cli-console';
import { ToastService } from '../../../../core/services/toast';
import { PlayroomLifecycleService } from '../../../../core/services/playroom-lifecycle';
import { PlayroomDefaultsService } from '../../../../core/services/playroom-defaults';
import { PlayroomStateService } from '../../../../core/services/playroom-state';
import { ImageCatalogService } from '../../../../core/services/image-catalog';
import { PlayroomCreateInput, wailsApi } from '../../../../core/services/wails-api';
import {
  CommandPreviewComponent,
  StringListEditorComponent,
  WizardStep,
  WizardStepper,
} from '../../../../shared/components';
import { EXPOSURES } from '../../../../shared/data';
import { CreateForm, ImageEntry, Playroom } from '../../../../shared/models';
import { NAME_RE, blankCreateForm, updateCache } from '../../../../shared/utils';

type CreateStepKey = 'basics' | 'resources' | 'forwarding' | 'options' | 'review';

/**
 * Guided "create playroom" drawer: the multi-step form, its validation, and the
 * side effects of creating.
 */
@Component({
  selector: 'app-create-playroom-drawer',
  imports: [
    CommonModule,
    FormsModule,
    DrawerModule,
    ButtonModule,
    SelectModule,
    InputTextModule,
    ToggleSwitchModule,
    CommandPreviewComponent,
    StringListEditorComponent,
    WizardStepper,
  ],
  templateUrl: './create-playroom-drawer.html',
  styleUrl: './create-playroom-drawer.css',
})
export class CreatePlayroomDrawerComponent implements OnChanges {
  private readonly state = inject(PlayroomStateService);
  private readonly actions = inject(PlayroomLifecycleService);
  private readonly notify = inject(ToastService);
  private readonly console = inject(CliConsoleService);
  private readonly defaults = inject(PlayroomDefaultsService);
  private readonly router = inject(Router);
  private readonly imageCatalog = inject(ImageCatalogService);

  /**
   * The command preview comes from the backend, so what is shown is the arguments
   * that will actually run. It refreshes only when the form really changes.
   */
  readonly previewCreate = wailsApi.previewCreatePlayroom;

  images: ImageEntry[] = [];
  readonly steps: (WizardStep & { key: CreateStepKey })[] = [
    { key: 'basics', label: 'Basics', icon: 'pi pi-box' },
    { key: 'resources', label: 'Resources', icon: 'pi pi-server' },
    { key: 'forwarding', label: 'Forwarding', icon: 'pi pi-share-alt' },
    { key: 'options', label: 'Options', icon: 'pi pi-sliders-h' },
    { key: 'review', label: 'Review', icon: 'pi pi-check-circle' },
  ];

  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Input() playhouse = '';

  form: CreateForm = blankCreateForm('');
  touched = false;
  step = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.form = blankCreateForm(this.playhouse);
      this.touched = false;
      this.step = 0;
      void this.loadImages();
      void this.seedFromDefaults();
    }
  }

  /**
   * Re-seeds the form from the user's `playroom config` defaults once they
   * arrive, unless the user has already started typing.
   */
  private async seedFromDefaults(): Promise<void> {
    const opened = this.playhouse;
    const pristine = JSON.stringify(this.form);
    await this.defaults.loadConfiguredDefaultsOnce();
    if (!this.visible || this.playhouse !== opened) return;
    if (JSON.stringify(this.form) !== pristine) return;
    this.form = blankCreateForm(opened, this.defaults);
  }

  /**
   * Loads the selectable playroom images from the backend. On failure the list
   * is empty and the editable select still takes a registry path by hand.
   */
  async loadImages(): Promise<void> {
    try {
      this.images = await this.imageCatalog.loadImageCatalogOnce();
    } catch {
      this.images = [];
    }
  }

  onVisibleChange(value: boolean): void {
    this.visible = value;
    this.visibleChange.emit(value);
  }

  close(): void {
    this.onVisibleChange(false);
  }

  /**
   * The single description of this form as a backend input. Both the preview
   * and the create call use it, so they cannot describe different commands.
   */
  toInput(): Partial<PlayroomCreateInput> {
    const form = this.form;
    return {
      Name: form.name,
      Playhouse: form.playhouse,
      Image: form.image,
      Storage: form.storage,
      CPURequest: form.cpuReq,
      CPULimit: form.cpuLim,
      MemoryRequest: form.memReq,
      MemoryLimit: form.memLim,
      SSHKey: form.sshKey,
      EnvVars: form.env.filter(Boolean),
      GitRepos: form.git.filter(Boolean),
      Copies: form.copy.filter(Boolean),
      Ports: form.ports.filter(Boolean),
      ProxyGroup: form.proxyGroup,
      Exposure: form.exposure,
      Ephemeral: form.ephemeral,
      ReadOnly: form.readOnly,
      // Guarded by the acknowledgement: the toggle alone does not send it, so a
      // user cannot arm the dangerous flag and then forget they did.
      Privileged: form.privileged && form.acknowledgePrivileged,
      NoWait: form.noWait,
      WaitTimeout: form.waitTimeout,
      ForceInstall: form.forceInstall,
    };
  }

  // ── Step navigation ────────────────────────────────────────────────────────

  stepKey(): CreateStepKey {
    return this.steps[this.step]?.key ?? 'basics';
  }

  goStep(index: number): void {
    if (index < this.step || this.canLeaveStep()) {
      this.step = Math.max(0, Math.min(index, this.steps.length - 1));
    } else {
      this.touched = true;
    }
  }

  next(): void {
    this.touched = true;
    if (!this.canLeaveStep()) return;
    this.step = Math.min(this.step + 1, this.steps.length - 1);
    this.touched = false;
  }

  previous(): void {
    this.step = Math.max(this.step - 1, 0);
    this.touched = false;
  }

  canLeaveStep(): boolean {
    if (this.stepKey() === 'basics') return !this.nameInvalid();
    return true;
  }

  /** Whatever is stopping Create, so the Review step can say it out loud
   *  instead of leaving a disabled button with its reason on another step. */
  blockingError(): string {
    if (this.nameInvalid()) return this.nameError() || 'A name is required.';
    return this.privilegedError();
  }

  canCreate(): boolean {
    return !this.nameInvalid() && !this.privilegedError();
  }

  portCount(): number {
    return this.form.ports.filter((value) => value.trim().length > 0).length;
  }

  /**
   * `--privileged` grants every Linux capability and host device access, so it
   * takes a deliberate acknowledgement rather than a stray toggle.
   */
  privilegedError(): string {
    if (this.form.privileged && !this.form.acknowledgePrivileged) {
      return 'Confirm you understand what privileged mode grants.';
    }
    return '';
  }

  readonly exposureOptions = [...EXPOSURES];

  private nameInvalid(): boolean {
    return !this.form.name || !NAME_RE.test(this.form.name);
  }

  nameError(): string {
    if (!this.touched) return '';
    if (!this.form.name) return 'name is required';
    if (!NAME_RE.test(this.form.name)) return 'lowercase letters, digits, dashes (DNS-1123)';
    return '';
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(): Promise<void> {
    this.touched = true;
    if (!this.canCreate()) return;
    const form = this.form;
    this.close();

    const optimistic: Playroom = {
      name: form.name,
      owner: this.state.user(),
      status: 'creating',
      rawStatus: '',
      host: '',
      ageMin: 0,
      disk: form.storage,
      diskType: form.ephemeral ? 'ephemeral' : 'persistent',
      image: form.image,
      cpuReq: form.cpuReq,
      cpuLim: form.cpuLim,
      memReq: form.memReq,
      memLim: form.memLim,
      ports: form.ports.filter(Boolean).join(', '),
      system: form.readOnly ? 'read-only' : 'writable',
      playhouse: form.playhouse,
      ephemeral: form.ephemeral,
      env: [],
      git: [],
      copy: [],
    };
    this.state.setRooms([
      optimistic,
      ...this.state.rooms().filter((room) => room.name !== form.name),
    ]);

    const input = this.toInput();

    // The drawer is closed and the room already shows as "creating", so this
    // runs in the background and a toast reports how it went.
    let startedOperationId = '';
    try {
      await this.console.run(`Creating "${form.name}"`, (operationId) => {
        startedOperationId = operationId;
        this.notify.toast(`Creating "${form.name}" ...`, 'busy', operationId);
        return wailsApi.createPlayroom(operationId, input);
      });
      updateCache({ lastPlayroom: form.name, lastPlayhouse: form.playhouse });
      this.notify.toast(`Created "${form.name}"`, 'ok', startedOperationId);
      void this.router.navigate(['/rooms', form.name]);
      await this.actions.reload(form.playhouse);
    } catch (error) {
      this.notify.failure(`Could not create "${form.name}"`, error, startedOperationId);
      // Creation can fail after the playroom exists — a wait-timeout is the
      // obvious case — so reload rather than assuming it never got made.
      await this.actions.reload(form.playhouse);
    }
  }
}

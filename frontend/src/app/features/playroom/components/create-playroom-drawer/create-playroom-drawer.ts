import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import {
  createInputFor,
  PlayroomLifecycleService,
} from '../../../../core/services/playroom-lifecycle';
import { PlayroomDefaultsService } from '../../../../core/services/playroom-defaults';
import { PlayroomStateService } from '../../../../core/services/playroom-state';
import { ImageCatalogService } from '../../../../core/services/image-catalog';
import { UiSessionService } from '../../../../core/services/ui-session';
import { PlayroomCreateInput, wailsApi } from '../../../../core/services/wails-api';
import {
  CommandPreviewComponent,
  StringListEditorComponent,
  WizardStep,
  WizardStepper,
} from '../../../../shared/components';
import { OverlayFocusDirective } from '../../../../shared/directives';
import {
  CAPABILITIES,
  EXPOSURES,
  PLAYROOM_OPTION_TEXTS,
  PLAYROOM_SIZE_LABELS,
} from '../../../../shared/data';
import {
  CreateForm,
  CreatePlayroomMode,
  ImageEntry,
  PlayroomSize,
} from '../../../../shared/models';
import {
  NAME_RE,
  blankCreateForm,
  describeResourcesInPlainWords,
  findImageEntry,
  readCache,
  resourcesOfSize,
  sizeMatchingResources,
  updateCache,
} from '../../../../shared/utils';

type CreateStepKey = 'basics' | 'resources' | 'forwarding' | 'options' | 'review';

/** What Easy mode shows, plus the playhouse it was opened in; every other input is an advanced option. */
const INPUT_FIELDS_SHOWN_IN_EASY_MODE: (keyof PlayroomCreateInput)[] = [
  'Name',
  'Playhouse',
  'Image',
  'CPURequest',
  'CPULimit',
  'MemoryRequest',
  'MemoryLimit',
];

/** Validation stays here; accepted commands outlive the drawer in the lifecycle service. */
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
    OverlayFocusDirective,
  ],
  templateUrl: './create-playroom-drawer.html',
  styleUrl: './create-playroom-drawer.css',
})
export class CreatePlayroomDrawerComponent implements OnChanges, OnDestroy {
  private readonly state = inject(PlayroomStateService);
  private readonly actions = inject(PlayroomLifecycleService);
  private readonly defaults = inject(PlayroomDefaultsService);
  private readonly imageCatalog = inject(ImageCatalogService);
  private readonly session = inject(UiSessionService);
  submitFailure = '';

  get submitting(): boolean {
    return !!this.actions.pendingOperation(this.form.name);
  }

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
  /** Both modes edit the same form; only how much of it is on screen differs. */
  mode: CreatePlayroomMode = readCache().createPlayroomMode;
  readonly optionTexts = PLAYROOM_OPTION_TEXTS;
  readonly sizeLabels = PLAYROOM_SIZE_LABELS;
  /** Set by "Go to Options" on the image error, so the privileged toggle is in view on arrival. */
  advancedSecurityOpenedFromImageError = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      const draft = this.session.recall<{ form: CreateForm; step: number }>('create');
      this.form = draft?.form ?? blankCreateForm(this.playhouse);
      this.touched = false;
      this.submitFailure = '';
      this.step = draft?.step ?? 0;
      this.advancedSecurityOpenedFromImageError = false;
      void this.loadImages();
      if (!draft) void this.seedFromDefaults();
    }
  }

  /**
   * Re-seeds the form from the user's `playroom config` defaults once they
   * arrive, unless the user has already started typing.
   */
  private async seedFromDefaults(): Promise<void> {
    const opened = this.playhouse;
    const pristine = JSON.stringify(this.form);
    try {
      await this.defaults.loadConfiguredDefaultsOnce();
    } catch {
      // The built-in form defaults remain usable when the CLI is unavailable.
    }
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
    if (!value) this.rememberDraft();
    this.visible = value;
    this.visibleChange.emit(value);
  }

  close(): void {
    this.onVisibleChange(false);
  }

  private rememberDraft(): void {
    if (this.form.playhouse === this.state.playhouse())
      this.session.remember('create', { form: this.form, step: this.step });
  }

  ngOnDestroy(): void {
    if (this.visible) this.rememberDraft();
  }

  discardDraft(): void {
    if (this.submitting) return;
    this.session.forget('create');
    this.form = blankCreateForm(this.playhouse, this.defaults);
    this.step = 0;
    this.touched = false;
    this.submitFailure = '';
  }

  private focusName(): void {
    setTimeout(() => document.getElementById('create-name')?.focus());
  }

  /** The same in both modes, so Easy sends exactly what Advanced would for this form. */
  toInput(): Partial<PlayroomCreateInput> {
    return createInputFor(this.form);
  }

  // ── Easy and Advanced ──────────────────────────────────────────────────────

  /** Lands on Basics, so the steps are walked from the start with everything filled in. */
  switchToAdvancedMode(): void {
    this.rememberMode('advanced');
    this.step = 0;
  }

  switchToEasyMode(): void {
    this.rememberMode('easy');
  }

  private rememberMode(mode: CreatePlayroomMode): void {
    this.mode = mode;
    updateCache({ createPlayroomMode: mode });
  }

  /** What the form was seeded with: the values the Defaults screen shows. */
  formFilledWithYourDefaults(): CreateForm {
    return blankCreateForm(this.form.playhouse, this.defaults);
  }

  /** Easy hides these, so it says how many will be sent differently from your defaults. */
  countAdvancedOptionsDifferentFromDefaults(): number {
    const input = this.toInput();
    const inputWithYourDefaults = createInputFor(this.formFilledWithYourDefaults());
    return (Object.keys(input) as (keyof PlayroomCreateInput)[]).filter(
      (field) =>
        !INPUT_FIELDS_SHOWN_IN_EASY_MODE.includes(field) &&
        JSON.stringify(input[field]) !== JSON.stringify(inputWithYourDefaults[field]),
    ).length;
  }

  readonly sizeOptions: { id: PlayroomSize; label: string; disabled: boolean }[] = (
    ['defaults', 'small', 'medium', 'large'] as const
  ).map((id) => ({ id, label: PLAYROOM_SIZE_LABELS[id], disabled: false }));
  /** Custom is listed only while the values are custom, and cannot be picked: it is whatever was typed. */
  readonly sizeOptionsWithCustom = [
    ...this.sizeOptions,
    { id: 'custom' as const, label: PLAYROOM_SIZE_LABELS.custom, disabled: true },
  ];

  selectedSize(): PlayroomSize {
    return sizeMatchingResources(this.form, this.formFilledWithYourDefaults());
  }

  chooseSize(size: PlayroomSize): void {
    if (size === 'custom') return;
    Object.assign(this.form, resourcesOfSize(size, this.formFilledWithYourDefaults()));
  }

  describeSize(size: PlayroomSize): string {
    if (size === 'custom') return describeResourcesInPlainWords(this.form);
    return describeResourcesInPlainWords(resourcesOfSize(size, this.formFilledWithYourDefaults()));
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
      this.focusName();
    }
  }

  next(): void {
    this.touched = true;
    if (!this.canLeaveStep()) {
      this.focusName();
      return;
    }
    this.step = Math.min(this.step + 1, this.steps.length - 1);
    this.touched = false;
  }

  previous(): void {
    this.step = Math.max(this.step - 1, 0);
    this.touched = false;
  }

  goToPrivilegedModeOnOptionsStep(): void {
    if (this.mode !== 'advanced') this.switchToAdvancedMode();
    this.advancedSecurityOpenedFromImageError = true;
    this.goStep(this.steps.findIndex((step) => step.key === 'options'));
    setTimeout(() => {
      const target = document.getElementById('create-privileged');
      target?.scrollIntoView({ block: 'center', behavior: 'instant' });
      target?.focus({ preventScroll: true });
    });
  }

  canLeaveStep(): boolean {
    if (this.stepKey() === 'basics') return !this.nameInvalid();
    return true;
  }

  /** Whatever is stopping Create, so the Review step can say it out loud
   *  instead of leaving a disabled button with its reason on another step. */
  blockingError(): string {
    if (this.nameInvalid()) return this.nameError() || 'A name is required.';
    return this.privilegedError() || this.imageError();
  }

  canCreate(): boolean {
    return !this.nameInvalid() && !this.privilegedError() && !this.imageError();
  }

  selectedImage(): ImageEntry | undefined {
    return findImageEntry(this.images, this.form.image);
  }

  /** acloud refuses an image like claude-code-dind outside privileged mode, so refuse it here first. */
  imageError(): string {
    const privilegedIsOn = this.form.privileged && this.form.acknowledgePrivileged;
    if (this.selectedImage()?.RequiresPrivileged && !privilegedIsOn) {
      return `${this.form.image} needs privileged mode. Turn it on under Options.`;
    }
    return '';
  }

  /** Basics waits for Next; Easy has no Next, and its Create stays disabled until this is fixed. */
  imageErrorShown(): string {
    return this.touched || this.mode !== 'advanced' ? this.imageError() : '';
  }

  capAddCount(): number {
    return this.form.capAdd.filter((value) => value.trim().length > 0).length;
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
  readonly capabilitiesOptions = [
    {
      id: '',
      label: 'Your default',
      hint: 'Sends nothing, so your defaults or acloud decide',
    },
    ...CAPABILITIES,
  ];

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

  create(): void {
    if (this.submitting) return;
    this.touched = true;
    if (!this.canCreate()) return;
    this.submitFailure = '';
    this.rememberDraft();
    if (!this.actions.startCreate(this.form)) {
      this.submitFailure = 'This room is already being changed, or the selected playhouse changed.';
      return;
    }
    this.visible = false;
    this.visibleChange.emit(false);
  }
}

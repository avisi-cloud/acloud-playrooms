import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { AcloudSessionService } from '../../../../core/services/acloud-session';
import { ImageCatalogService } from '../../../../core/services/image-catalog';
import { PlayroomDefaultsService } from '../../../../core/services/playroom-defaults';
import { PlayroomStateService } from '../../../../core/services/playroom-state';
import { ScopeService } from '../../../../core/services/scope';
import { SetupService, SetupStepKey, SetupStepStatus } from '../../../../core/services/setup';
import { ToastService } from '../../../../core/services/toast';
import { WizardStep, WizardStepper } from '../../../../shared/components';
import {
  CREATE_PLAYROOM_QUERY_PARAM,
  PLAYROOM_OPTION_TEXTS,
  SETUP_STEP_QUERY_PARAM,
} from '../../../../shared/data';
import { ToolStatus } from '../../../../shared/models';
import { describeError } from '../../../../shared/utils';
import { AcloudBinaryCardComponent } from '../../../defaults/components/acloud-binary/acloud-binary';

interface SetupStep extends WizardStep {
  key: SetupStepKey;
  /** Next stays disabled until a required step is done. */
  required: boolean;
  /** The line under the title; a required step says why it is required. */
  summary: string;
}

const SETUP_STEPS: SetupStep[] = [
  {
    key: 'welcome',
    label: 'Welcome',
    icon: 'pi pi-home',
    required: false,
    summary: 'A few checks, then you can create your first playroom.',
  },
  {
    key: 'acloud',
    label: 'Acloud CLI',
    icon: 'pi pi-code',
    required: true,
    summary: 'Required: this app runs every action as an acloud command.',
  },
  {
    key: 'login',
    label: 'Log in',
    icon: 'pi pi-sign-in',
    required: true,
    summary: 'Required: acloud needs your account to reach your playhouses.',
  },
  {
    key: 'playhouse',
    label: 'Playhouse',
    icon: 'pi pi-server',
    required: true,
    summary: 'Required: your playrooms are created in this playhouse.',
  },
  {
    key: 'tools',
    label: 'Tools',
    icon: 'pi pi-wrench',
    required: false,
    summary: 'Optional: these help you connect. Nothing here blocks you.',
  },
  {
    key: 'defaults',
    label: 'Your defaults',
    icon: 'pi pi-sliders-h',
    required: false,
    summary: 'Optional: new playrooms start with these. You can change them under Defaults.',
  },
  {
    key: 'done',
    label: 'Done',
    icon: 'pi pi-flag',
    required: false,
    summary: 'Create your first playroom now, or look around first.',
  },
];

type KnownToolCommand = 'ssh' | 'tailscale';

const TOOL_PURPOSES: Record<KnownToolCommand, string> = {
  ssh: 'Connect to a playroom from your terminal.',
  tailscale: 'Needed for Tailscale exposure and forwarded ports.',
};

/** Where a login started from this screen stands; being signed in is read from the session. */
type LoginProgress = 'not-started' | 'waiting-for-credentials' | 'not-signed-in' | 'failed';

/** The two defaults setup offers; the rest stay on the Defaults screen. */
type SetupDefaultKey = 'ssh-key' | 'image';

/**
 * Walks a new install through what it needs before its first playroom. Every
 * step reads its state from the services that own it, so it is ticked as soon
 * as it is satisfied, wherever that happened.
 */
@Component({
  selector: 'app-setup-page',
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    TagModule,
    WizardStepper,
    AcloudBinaryCardComponent,
  ],
  templateUrl: './setup.html',
  styleUrl: './setup.css',
})
export class SetupPageComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly notify = inject(ToastService);
  private readonly defaults = inject(PlayroomDefaultsService);
  private readonly imageCatalog = inject(ImageCatalogService);
  readonly setup = inject(SetupService);
  readonly session = inject(AcloudSessionService);
  readonly state = inject(PlayroomStateService);
  readonly scope = inject(ScopeService);

  readonly activeIndex = signal(0);
  readonly activeStep = computed(() => SETUP_STEPS[this.activeIndex()]);
  readonly isLastStep = computed(() => this.activeIndex() === SETUP_STEPS.length - 1);

  /** A checked step is ticked by its status; an optional one, like the create wizards, once passed. */
  readonly steps = computed<SetupStep[]>(() =>
    SETUP_STEPS.map((step) => {
      const status = this.statusOf(step.key);
      return status === null || status === 'optional' ? step : { ...step, done: status === 'done' };
    }),
  );

  readonly canGoToNextStep = computed(() => this.canOpenStep(this.activeIndex() + 1));

  readonly installedToolCount = computed(
    () => this.session.toolStatuses().filter((tool) => tool.State === 'installed').length,
  );

  readonly loginProgress = signal<LoginProgress>('not-started');
  readonly loginFailure = signal('');

  readonly optionTexts = PLAYROOM_OPTION_TEXTS;
  readonly sshKeyDraft = signal('');
  readonly imageDraft = signal('');
  readonly defaultsFailure = signal('');
  readonly savingDefaults = signal(false);
  imageOptions: { label: string; value: string }[] = [];

  readonly defaultsChanged = computed(
    () =>
      this.sshKeyDraft() !== this.defaults.configuredText('ssh-key') ||
      this.imageDraft() !== this.defaults.configuredText('image'),
  );

  constructor() {
    // An effect rather than a call on entering the step: a login from the
    // sidebar while this step is open has to load the list as well.
    effect(() => {
      if (this.activeStep().key !== 'playhouse' || !this.state.loggedIn()) return;
      untracked(() => this.loadPlayhousesAndTheirOrganisation());
    });
  }

  ngOnInit(): void {
    const requested = this.route.snapshot.queryParamMap.get(SETUP_STEP_QUERY_PARAM);
    const index = SETUP_STEPS.findIndex((step) => step.key === requested);
    if (index > 0) this.showStep(index);
  }

  statusOf(key: SetupStepKey): SetupStepStatus | null {
    if (key === 'welcome' || key === 'done') return null;
    return this.setup.stepStatuses()[key];
  }

  statusLabel(status: SetupStepStatus): string {
    if (status === 'done') return 'Done';
    if (status === 'needs-action') return 'Needs action';
    return 'Optional';
  }

  statusSeverity(status: SetupStepStatus): 'success' | 'warn' | 'secondary' {
    if (status === 'done') return 'success';
    if (status === 'needs-action') return 'warn';
    return 'secondary';
  }

  // ── Step navigation ────────────────────────────────────────────────────────

  /** Going back is always allowed; forward only past required steps that are done. */
  canOpenStep(index: number): boolean {
    if (index < 0 || index >= SETUP_STEPS.length) return false;
    if (index <= this.activeIndex()) return true;
    return SETUP_STEPS.slice(0, index).every(
      (step) => !step.required || this.statusOf(step.key) === 'done',
    );
  }

  goToStep(index: number): void {
    if (this.canOpenStep(index)) this.showStep(index);
  }

  goToNextStep(): void {
    this.goToStep(this.activeIndex() + 1);
  }

  goToPreviousStep(): void {
    this.goToStep(this.activeIndex() - 1);
  }

  private showStep(index: number): void {
    this.activeIndex.set(index);
    if (SETUP_STEPS[index].key === 'defaults') void this.loadDefaultsForm();
  }

  // ── Log in ─────────────────────────────────────────────────────────────────

  async signIn(): Promise<void> {
    this.loginProgress.set('not-started');
    this.loginFailure.set('');
    try {
      const signedIn = await this.session.signInThroughTerminal(() =>
        this.loginProgress.set('waiting-for-credentials'),
      );
      this.loginProgress.set(signedIn ? 'not-started' : 'not-signed-in');
    } catch (error) {
      this.loginFailure.set(describeError(error));
      this.loginProgress.set('failed');
    }
  }

  // ── Playhouse ──────────────────────────────────────────────────────────────

  /** Context and organisation are read again too, since a login can change them. */
  private loadPlayhousesAndTheirOrganisation(): void {
    void this.scope.loadContextAndOrganisation();
    void this.scope.loadPlayhousesForMenu();
  }

  choosePlayhouse(slug: string | null): void {
    if (slug) this.state.selectPlayhouse(slug);
  }

  goToPlayhouses(): void {
    void this.router.navigate(['/playhouse']);
  }

  // ── Tools ──────────────────────────────────────────────────────────────────

  /** Empty for a tool this build does not know: it shows its name and state only. */
  toolPurpose(tool: ToolStatus): string {
    return Object.hasOwn(TOOL_PURPOSES, tool.Command)
      ? TOOL_PURPOSES[tool.Command as KnownToolCommand]
      : '';
  }

  toolSeverity(tool: ToolStatus): 'success' | 'warn' | 'secondary' {
    if (tool.State === 'installed') return 'success';
    if (tool.State === 'missing') return 'warn';
    return 'secondary';
  }

  // ── Your defaults ──────────────────────────────────────────────────────────

  private async loadDefaultsForm(): Promise<void> {
    this.defaultsFailure.set('');
    const [configured, images] = await Promise.allSettled([
      this.defaults.loadConfiguredDefaultsOnce(),
      this.imageCatalog.loadImageCatalogOnce(),
    ]);
    if (configured.status === 'rejected')
      this.defaultsFailure.set(describeError(configured.reason));
    this.imageOptions =
      images.status === 'fulfilled'
        ? images.value.map((image) => ({
            label: image.IsDefault ? `${image.Name} (default)` : image.Name,
            value: image.Name,
          }))
        : [];
    this.sshKeyDraft.set(this.defaults.configuredText('ssh-key'));
    this.imageDraft.set(this.defaults.configuredText('image'));
  }

  /** The defaults step's footer action: saves what changed, the way the Defaults screen does. */
  async saveDefaultsAndContinue(): Promise<void> {
    if (this.savingDefaults()) return;
    this.savingDefaults.set(true);
    try {
      await this.saveDefaultWhenChanged('ssh-key', this.sshKeyDraft());
      await this.saveDefaultWhenChanged('image', this.imageDraft());
      this.notify.show({ severity: 'success', detail: 'Defaults saved', life: 2500 });
      this.defaults.forgetCachedDefaults();
      this.goToNextStep();
    } catch (error) {
      this.notify.failure('Could not save the defaults', error);
    } finally {
      this.savingDefaults.set(false);
    }
  }

  private async saveDefaultWhenChanged(key: SetupDefaultKey, draft: string): Promise<void> {
    if (draft === this.defaults.configuredText(key)) return;
    const builtin = this.defaults.entries().find((entry) => entry.Key === key)?.Builtin ?? '';
    await this.defaults.saveDefault(key, draft, builtin);
  }

  // ── Leaving ────────────────────────────────────────────────────────────────

  finishAndCreateFirstPlayroom(): void {
    this.setup.markSetupCompleted();
    void this.router.navigate(['/rooms'], {
      queryParams: { [CREATE_PLAYROOM_QUERY_PARAM]: true },
    });
  }

  finishAndGoToPlayrooms(): void {
    this.setup.markSetupCompleted();
    void this.router.navigate(['/rooms']);
  }

  /** Leaves without marking setup completed, so it opens again at the next launch. */
  setUpLater(): void {
    void this.router.navigate(['/rooms']);
  }
}

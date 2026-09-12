import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { PLAYHOUSE_EXPOSURES } from '../../../../shared/data';
import { CommandPreviewComponent, WizardStep, WizardStepper } from '../../../../shared/components';
import { TypeToFilterSelectDirective } from '../../../../shared/directives';
import { PlayhouseCreateInput, wailsApi } from '../../../../core/services/wails-api';
import { CloudAccountEntry, EnvironmentEntry } from '../../../../shared/models';

type CreateStepKey = 'basics' | 'tailscale' | 'placement' | 'capacity' | 'review';

interface CreatePlayhouseForm {
  name: string;
  cloudAccount: string;
  region: string;
  environment: string;
  version: string;
  updateChannel: string;
  maintenanceScheduleIdentity: string;
  nodeType: string;
  systemNodeType: string;
  playroomNodeType: string;
  privilegedNodeType: string;
  nodeCount: number;
  maxPlayroomNodes: number;
  maxPrivilegedNodes: number;
  exposure: string;
  tailscaleOAuthClientID: string;
  tailscaleOAuthClientSecret: string;
  waitTimeout: string;
  noDefault: boolean;
  /** Two disclosures, two flags: one boolean for both had each flip the other. */
  advancedPlacement: boolean;
  advancedCapacity: boolean;
}

function blankForm(): CreatePlayhouseForm {
  return {
    name: '',
    cloudAccount: '',
    region: '',
    environment: '',
    version: '',
    updateChannel: 'regular',
    maintenanceScheduleIdentity: '',
    nodeType: '',
    systemNodeType: '',
    playroomNodeType: '',
    privilegedNodeType: '',
    nodeCount: 1,
    maxPlayroomNodes: 3,
    maxPrivilegedNodes: 0,
    // Blank is not a valid --exposure, so the form carries the CLI's own
    // default rather than pretending "unset" means something here.
    exposure: 'tailscale',
    tailscaleOAuthClientID: '',
    tailscaleOAuthClientSecret: '',
    waitTimeout: '20m',
    noDefault: false,
    advancedPlacement: false,
    advancedCapacity: false,
  };
}

export function normalizePlayhouseSlug(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) return '';
  return slug.startsWith('playhouse-') ? slug : `playhouse-${slug}`;
}

/**
 * Guided "create playhouse" drawer: the multi-step form and its validation. The
 * page owns the long-running provisioning that follows.
 */
@Component({
  selector: 'app-create-playhouse-drawer',
  imports: [
    CommonModule,
    FormsModule,
    DrawerModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    ToggleSwitchModule,
    CommandPreviewComponent,
    WizardStepper,
    TypeToFilterSelectDirective,
  ],
  templateUrl: './create-playhouse-drawer.html',
  styleUrl: './create-playhouse-drawer.css',
})
export class CreatePlayhouseDrawerComponent implements OnChanges {
  /** Backend-generated, so the preview is the arguments that will run. */
  readonly previewCreate = wailsApi.previewCreatePlayhouse;

  readonly steps: (WizardStep & { key: CreateStepKey })[] = [
    { key: 'basics', label: 'Basics', icon: 'pi pi-home' },
    { key: 'tailscale', label: 'Connection', icon: 'pi pi-link' },
    { key: 'placement', label: 'Placement', icon: 'pi pi-map-marker' },
    { key: 'capacity', label: 'Capacity', icon: 'pi pi-server' },
    { key: 'review', label: 'Review', icon: 'pi pi-check-circle' },
  ];

  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() create = new EventEmitter<{ input: Partial<PlayhouseCreateInput>; slug: string }>();

  form: CreatePlayhouseForm = blankForm();
  step = 0;
  touched = false;

  readonly exposureOptions = [...PLAYHOUSE_EXPOSURES];

  cloudAccounts: CloudAccountEntry[] = [];
  cloudAccountsLoading = false;
  cloudAccountsError = '';

  environments: EnvironmentEntry[] = [];
  environmentsLoading = false;
  environmentsError = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.form = blankForm();
      this.step = 0;
      this.touched = false;
      void this.loadCloudAccounts();
      void this.loadEnvironments();
    }
  }

  /**
   * Loads cloud accounts for the placement selector. Small and org-scoped, so it
   * is fetched once each time the drawer opens.
   */
  async loadCloudAccounts(): Promise<void> {
    this.cloudAccountsLoading = true;
    this.cloudAccountsError = '';
    try {
      this.cloudAccounts = await wailsApi.listCloudAccounts();
    } catch (err) {
      this.cloudAccountsError = err instanceof Error ? err.message : String(err);
      this.cloudAccounts = [];
    } finally {
      this.cloudAccountsLoading = false;
    }
  }

  /** Human label for a cloud account identity: "DisplayName (Provider)". */
  cloudAccountLabel(identity: string): string {
    const account = this.cloudAccounts.find((cloudAccount) => cloudAccount.Identity === identity);
    if (!account) return identity;
    return account.Provider ? `${account.DisplayName} (${account.Provider})` : account.DisplayName;
  }

  /**
   * Loads environments for the placement selector. Small and org-scoped, so it
   * is fetched once each time the drawer opens.
   */
  async loadEnvironments(): Promise<void> {
    this.environmentsLoading = true;
    this.environmentsError = '';
    try {
      this.environments = await wailsApi.listEnvironments();
    } catch (err) {
      this.environmentsError = err instanceof Error ? err.message : String(err);
      this.environments = [];
    } finally {
      this.environmentsLoading = false;
    }
  }

  /** Human label for an environment slug: "Name" (falls back to the slug). */
  environmentLabel(slug: string): string {
    const env = this.environments.find((environmentEntry) => environmentEntry.Slug === slug);
    return env?.Name || slug;
  }

  onVisibleChange(value: boolean): void {
    this.visible = value;
    this.visibleChange.emit(value);
  }

  close(): void {
    this.onVisibleChange(false);
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
    switch (this.stepKey()) {
      case 'basics':
        return !this.nameError();
      case 'tailscale':
        return !this.tailscaleError();
      case 'placement':
        return !this.cloudAccountError();
      case 'capacity':
        return !this.capacityError() && !this.capacityPrivilegedError();
      default:
        return true;
    }
  }

  canCreate(): boolean {
    return (
      !this.nameError() &&
      !this.tailscaleError() &&
      !this.cloudAccountError() &&
      !this.capacityError() &&
      !this.capacityPrivilegedError() &&
      !this.versionError()
    );
  }

  // ── Validation ─────────────────────────────────────────────────────────────

  cloudAccountError(): string {
    // The editable p-select can null the model when its input is cleared, so
    // coerce before trimming.
    if (!(this.form.cloudAccount ?? '').trim()) return 'A cloud account is required.';
    return '';
  }

  nameError(): string {
    const name = this.form.name.trim();
    if (!name) return 'Playhouse name is required.';
    if (!/[a-zA-Z0-9]/.test(name)) return 'Use at least one letter or number.';
    return '';
  }

  /**
   * Tailscale credentials are only needed for `--exposure tailscale`; demanding
   * them regardless puts the other exposures out of reach.
   */
  tailscaleError(): string {
    if (!this.needsTailscale()) return '';
    if (!this.form.tailscaleOAuthClientID.trim())
      return 'Tailscale OAuth client ID is required for the tailscale exposure.';
    if (!this.form.tailscaleOAuthClientSecret.trim())
      return 'Tailscale OAuth client secret is required for the tailscale exposure.';
    return '';
  }

  needsTailscale(): boolean {
    return this.form.exposure === 'tailscale';
  }

  capacityPrivilegedError(): string {
    if (!this.form.advancedCapacity) return '';
    if (Number(this.form.maxPrivilegedNodes) < 0) return 'Max privileged nodes cannot be negative.';
    return '';
  }

  capacityError(): string {
    if (!Number.isFinite(Number(this.form.nodeCount)) || Number(this.form.nodeCount) < 1)
      return 'System node count must be at least 1.';
    if (
      !Number.isFinite(Number(this.form.maxPlayroomNodes)) ||
      Number(this.form.maxPlayroomNodes) < 1
    )
      return 'Max playroom nodes must be at least 1.';
    return '';
  }

  versionError(): string {
    if (this.form.advancedPlacement && this.form.version.trim() && this.form.updateChannel.trim())
      return 'Use either a pinned version or an update channel, not both.';
    return '';
  }

  displaySlug(): string {
    return normalizePlayhouseSlug(this.form.name) || 'playhouse-<name>';
  }

  selectedCloudAccountLabel(): string {
    const identity = (this.form.cloudAccount ?? '').trim();
    return identity ? this.cloudAccountLabel(identity) : 'not set';
  }

  submit(): void {
    this.touched = true;
    if (!this.canCreate()) return;
    this.create.emit({ input: this.toInput(), slug: normalizePlayhouseSlug(this.form.name) });
    this.close();
  }

  /**
   * The single description of this form as a backend input. Both the preview
   * and the create call use it, so they cannot describe different commands.
   */
  toInput(): Partial<PlayhouseCreateInput> {
    const f = this.form;
    return {
      Name: f.name,
      // The editable p-selects can null their model when cleared; coerce to ''.
      CloudAccount: f.cloudAccount ?? '',
      Region: f.advancedPlacement ? f.region : '',
      Environment: f.environment ?? '',
      Version: f.advancedPlacement ? f.version : '',
      UpdateChannel: f.advancedPlacement ? f.updateChannel : 'regular',
      MaintenanceScheduleIdentity: f.advancedPlacement ? f.maintenanceScheduleIdentity : '',
      NodeType: f.advancedCapacity ? f.nodeType : '',
      SystemNodeType: f.advancedCapacity ? f.systemNodeType : '',
      PlayroomNodeType: f.advancedCapacity ? f.playroomNodeType : '',
      PrivilegedNodeType: f.advancedCapacity ? f.privilegedNodeType : '',
      NodeCount: f.nodeCount,
      MaxPlayroomNodes: f.maxPlayroomNodes,
      MaxPrivilegedNodes: f.advancedCapacity ? f.maxPrivilegedNodes : 0,
      Exposure: f.exposure,
      TailscaleOAuthClientID: f.tailscaleOAuthClientID,
      TailscaleOAuthClientSecret: f.tailscaleOAuthClientSecret,
      WaitTimeout: f.advancedCapacity ? f.waitTimeout : '20m',
      NoDefault: f.noDefault,
    };
  }
}

import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { CommandPreviewComponent } from '../../../../shared/components';
import { PLAYHOUSE_EXPOSURES } from '../../../../shared/data';
import {
  PlayhouseEntry,
  PlayhouseUpdateInput,
  wailsApi,
} from '../../../../core/services/wails-api';

interface UpdatePlayhouseForm {
  exposure: string;
  tailscaleOAuthClientID: string;
  tailscaleOAuthClientSecret: string;
  maxPlayroomNodes: number;
  maxPrivilegedNodes: number;
  waitTimeout: string;
}

/** Nothing chosen means "leave it as it is", so the form starts empty. */
function blankForm(): UpdatePlayhouseForm {
  return {
    exposure: '',
    tailscaleOAuthClientID: '',
    tailscaleOAuthClientSecret: '',
    maxPlayroomNodes: 0,
    maxPrivilegedNodes: 0,
    waitTimeout: '20m',
  };
}

/**
 * "Edit playhouse": the three settings a converge can actually change.
 *
 * There is no `acloud playhouse update` — re-running `playhouse create` with an
 * existing name converges it. On that path the node types and node count are
 * taken from the live pools, and the version, update channel and maintenance
 * schedule are only read while provisioning a new cluster, so offering them
 * would offer settings that silently do not apply. The drawer says as much
 * rather than leaving the omission to be discovered.
 */
@Component({
  selector: 'app-update-playhouse-drawer',
  imports: [
    CommonModule,
    FormsModule,
    DrawerModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    CommandPreviewComponent,
  ],
  templateUrl: './update-playhouse-drawer.html',
  styleUrl: './update-playhouse-drawer.css',
})
export class UpdatePlayhouseDrawerComponent implements OnChanges {
  /** Backend-generated, so the preview is the arguments that will run. */
  readonly previewUpdate = wailsApi.previewUpdatePlayhouse;

  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Input() playhouse: PlayhouseEntry | null = null;
  @Output() update = new EventEmitter<{ input: Partial<PlayhouseUpdateInput>; slug: string }>();

  form: UpdatePlayhouseForm = blankForm();

  /** Blank first: an unset exposure leaves the playhouse's own in place. */
  readonly exposureOptions = [
    { id: '', label: 'Leave unchanged', hint: 'Keep the current connectivity' },
    ...PLAYHOUSE_EXPOSURES,
  ];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) this.form = blankForm();
  }

  /** The slug without the prefix, which is what the command takes as NAME. */
  shortName(): string {
    return (this.playhouse?.Slug ?? '').replace(/^playhouse-/, '');
  }

  /**
   * Switching a playhouse onto Tailscale for the first time needs credentials;
   * they are stored in-cluster, so a playhouse already on Tailscale can be
   * re-converged without them.
   */
  showsTailscaleCredentials(): boolean {
    return this.form.exposure === 'tailscale';
  }

  /** Whether anything would actually change. */
  hasChanges(): boolean {
    return (
      this.form.exposure !== '' ||
      this.form.maxPlayroomNodes > 0 ||
      this.form.maxPrivilegedNodes > 0
    );
  }

  previewInput(): Partial<PlayhouseUpdateInput> {
    return {
      Name: this.shortName(),
      Exposure: this.form.exposure,
      TailscaleOAuthClientID: this.showsTailscaleCredentials()
        ? this.form.tailscaleOAuthClientID
        : '',
      TailscaleOAuthClientSecret: this.showsTailscaleCredentials()
        ? this.form.tailscaleOAuthClientSecret
        : '',
      MaxPlayroomNodes: this.form.maxPlayroomNodes,
      MaxPrivilegedNodes: this.form.maxPrivilegedNodes,
      WaitTimeout: this.form.waitTimeout,
    };
  }

  /** Converges with no settings at all: backfill pools, re-run the bootstrap. */
  submitUpgradeOnly(): void {
    this.form = blankForm();
    this.emit();
  }

  submit(): void {
    this.emit();
  }

  private emit(): void {
    const slug = this.playhouse?.Slug ?? '';
    if (!slug) return;
    this.update.emit({ input: this.previewInput(), slug });
    this.close();
  }

  close(): void {
    this.visible = false;
    this.visibleChange.emit(false);
  }
}

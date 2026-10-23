import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { CommandPreviewComponent, StringListEditorComponent } from '../../../../shared/components';
import { IP_ALLOWLIST_HINT, PLAYHOUSE_EXPOSURES } from '../../../../shared/data';
import {
  PlayhouseEntry,
  PlayhouseUpdateInput,
  wailsApi,
} from '../../../../core/services/wails-api';

interface UpdatePlayhouseForm {
  updateChannel: string;
  exposure: string;
  resetAllowlist: boolean;
  removeIPs: string[];
  allowIPs: string[];
  allowCurrentIP: boolean;
  tailscaleOAuthClientID: string;
  tailscaleOAuthClientSecret: string;
  maxPlayroomNodes: number;
  maxPrivilegedNodes: number;
  waitTimeout: string;
}

function filled(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

/** Nothing chosen means "leave it as it is", so the form starts empty. */
function blankForm(): UpdatePlayhouseForm {
  return {
    updateChannel: '',
    exposure: '',
    resetAllowlist: false,
    removeIPs: [''],
    allowIPs: [''],
    allowCurrentIP: false,
    tailscaleOAuthClientID: '',
    tailscaleOAuthClientSecret: '',
    maxPlayroomNodes: 0,
    maxPrivilegedNodes: 0,
    waitTimeout: '20m',
  };
}

/** "Edit playhouse": the settings `acloud playhouse update` can change on an existing playhouse. */
@Component({
  selector: 'app-update-playhouse-drawer',
  imports: [
    CommonModule,
    FormsModule,
    DrawerModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    ToggleSwitchModule,
    CommandPreviewComponent,
    StringListEditorComponent,
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
  readonly ipAllowlistHint = IP_ALLOWLIST_HINT;

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

  /** Run without a terminal, update never offers your IP for a switch to NodePort, so the toggle does. */
  onExposureChange(exposure: string): void {
    this.form.exposure = exposure;
    if (exposure === 'nodeport') this.form.allowCurrentIP = true;
  }

  /** Whether anything would actually change. */
  hasChanges(): boolean {
    return (
      this.form.updateChannel.trim() !== '' ||
      this.form.exposure !== '' ||
      this.form.resetAllowlist ||
      this.form.allowCurrentIP ||
      filled(this.form.removeIPs).length > 0 ||
      filled(this.form.allowIPs).length > 0 ||
      this.form.maxPlayroomNodes > 0 ||
      this.form.maxPrivilegedNodes > 0
    );
  }

  previewInput(): Partial<PlayhouseUpdateInput> {
    return {
      Name: this.shortName(),
      UpdateChannel: this.form.updateChannel.trim(),
      Exposure: this.form.exposure,
      ResetAllowlist: this.form.resetAllowlist,
      RemoveIPs: filled(this.form.removeIPs),
      AllowIPs: filled(this.form.allowIPs),
      AllowCurrentIP: this.form.allowCurrentIP,
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

  /** An update with no settings converges the playhouse to the layout this acloud ships. */
  submitBringUpToDate(): void {
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

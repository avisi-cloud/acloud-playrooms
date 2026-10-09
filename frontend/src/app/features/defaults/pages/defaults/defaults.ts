import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SliderModule } from 'primeng/slider';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { AcloudBinaryCardComponent } from '../../components/acloud-binary/acloud-binary';
import { CliConsoleService } from '../../../../core/services/cli-console';
import { ImageCatalogService } from '../../../../core/services/image-catalog';
import { PageLoadingService } from '../../../../core/services/page-loading';
import { PlayroomDefaultsService } from '../../../../core/services/playroom-defaults';
import { ToastService } from '../../../../core/services/toast';
import { wailsApi } from '../../../../core/services/wails-api';
import { EDITORS } from '../../../../shared/data';
import { DefaultEntry } from '../../../../shared/models';
import { explainFailure, FailureExplanation } from '../../../../shared/utils';

interface DefaultRow extends DefaultEntry {
  draft: string;
  dirty: boolean;
}

export type ControlKind = 'slider' | 'select' | 'toggle' | 'text';
export interface DefaultField {
  key: string;
  group: string;
  kind: ControlKind;
  options?: string[] | { label: string; value: string }[];
  dynamicOptions?: 'images';
}
interface DefaultViewRow extends DefaultRow {
  field: DefaultField;
  /** The value in the control is not the built-in one — see `groups`. */
  overridden: boolean;
}

/**
 * The value acloud reads as "leave this request or limit unset". Accepted by
 * create, play, update and `config set` since 0.35.0.
 */
const RESOURCE_NONE = 'none';

/** One registry owns grouping, control kind and options for every known key. */
export const DEFAULT_FIELDS: DefaultField[] = [
  { key: 'image', group: 'Resources', kind: 'select', dynamicOptions: 'images' },
  {
    key: 'storage',
    group: 'Resources',
    kind: 'slider',
    options: ['1Gi', '2Gi', '5Gi', '10Gi', '20Gi', '50Gi', '100Gi'],
  },
  {
    key: 'cpu-request',
    group: 'Resources',
    kind: 'slider',
    options: ['none', '100m', '250m', '500m', '1', '2', '4', '8'],
  },
  {
    key: 'cpu-limit',
    group: 'Resources',
    kind: 'slider',
    options: ['none', '250m', '500m', '1', '2', '4', '8', '16'],
  },
  {
    key: 'memory-request',
    group: 'Resources',
    kind: 'slider',
    options: ['none', '512Mi', '1Gi', '2Gi', '4Gi', '8Gi', '16Gi'],
  },
  {
    key: 'memory-limit',
    group: 'Resources',
    kind: 'slider',
    options: ['none', '512Mi', '1Gi', '2Gi', '4Gi', '8Gi', '16Gi'],
  },
  { key: 'user', group: 'Connection', kind: 'text' },
  { key: 'ssh-key', group: 'Connection', kind: 'text' },
  { key: 'forward-agent', group: 'Connection', kind: 'toggle' },
  { key: 'proxy-group', group: 'Networking', kind: 'text' },
  {
    key: 'editor',
    group: 'Behaviour',
    kind: 'select',
    options: [...EDITORS].map((editor) => ({ label: editor.label, value: editor.id })),
  },
  {
    key: 'wait-timeout',
    group: 'Behaviour',
    kind: 'slider',
    options: ['1m', '2m', '5m', '10m', '15m', '30m', '60m'],
  },
  { key: 'read-only', group: 'Behaviour', kind: 'toggle' },
];

const GROUP_ORDER = ['Resources', 'Connection', 'Networking', 'Behaviour', 'Other'];
const FIELD_BY_KEY = new Map(DEFAULT_FIELDS.map((field) => [field.key, field]));

/**
 * Sliders move in fine increments and snap on release, because PrimeNG floors
 * the position to the step rather than rounding it.
 */
const SLIDER_STEP = 0.02;

/**
 * Defaults screen: shows built-in, cached, and configured playroom-creation
 * defaults grouped by concern, and lets the user override or reset them.
 */
@Component({
  selector: 'app-defaults-page',
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    SliderModule,
    TagModule,
    ToggleSwitchModule,
    AcloudBinaryCardComponent,
  ],
  templateUrl: './defaults.html',
  styleUrl: './defaults.css',
})
export class DefaultsPageComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly notify = inject(ToastService);
  private readonly console = inject(CliConsoleService);
  private readonly defaults = inject(PlayroomDefaultsService);
  private readonly imageCatalog = inject(ImageCatalogService);
  private readonly pageLoading = inject(PageLoadingService);

  rows = signal<DefaultRow[]>([]);
  loading = signal(true);
  /** Why the defaults could not be read, in the two parts a toast shows it in. */
  failure = signal<FailureExplanation | null>(null);
  saving = signal(false);
  sliderValues: Record<string, number> = {};
  imageOptions: { label: string; value: string }[] = [];

  readonly dirtyCount = computed(() => this.rows().filter((row) => row.dirty).length);
  readonly hasDirty = computed(() => this.rows().some((row) => row.dirty));
  readonly hasConfigured = computed(() => this.rows().some((row) => row.Source === 'config'));
  /**
   * `overridden` reads from the draft rather than `Source`, so the row changes
   * the moment the control moves instead of only after a save.
   */
  readonly groups = computed(() => {
    const rows = this.rows().map<DefaultViewRow>((row) => ({
      ...row,
      field: FIELD_BY_KEY.get(row.Key) ?? { key: row.Key, group: 'Other', kind: 'text' },
      overridden: row.draft !== row.Builtin,
    }));
    return GROUP_ORDER.map((label) => ({
      label,
      rows: rows.filter((row) => row.field.group === label),
    })).filter((group) => group.rows.length > 0);
  });

  /**
   * The combinations acloud refuses, caught here rather than at the next
   * create. `config set cpu-request none` is accepted on its own, but a request
   * of `none` against a numeric limit fails every later create and play, since
   * Kubernetes defaults a missing request to the limit and would reserve the
   * whole thing. The command can only complain when it runs; this screen is
   * where the pair is actually being chosen.
   */
  readonly resourceWarnings = computed<string[]>(() => {
    const draftFor = (key: string) =>
      (this.rows().find((row) => row.Key === key)?.draft ?? '').trim().toLowerCase();
    const warnings: string[] = [];
    for (const resource of ['cpu', 'memory'] as const) {
      const limit = draftFor(`${resource}-limit`);
      if (draftFor(`${resource}-request`) === RESOURCE_NONE && limit !== RESOURCE_NONE && limit) {
        warnings.push(
          `${resource}-request is none while ${resource}-limit is ${limit}. ` +
            `Kubernetes would reserve the full limit, so acloud refuses this pair: ` +
            `set ${resource}-limit to none as well, or give ${resource}-request a value.`,
        );
      }
    }
    return warnings;
  });

  async ngOnInit(): Promise<void> {
    await Promise.all([this.refreshDefaults(), this.loadImageOptions()]);
  }

  /**
   * Loads the image default's options from the backend, as the friendly alias
   * that GetPlayroomDefaults reports as the built-in.
   */
  private async loadImageOptions(): Promise<void> {
    try {
      const images = await this.imageCatalog.loadImageCatalogOnce();
      this.imageOptions = images.map((image) => ({
        label: image.IsDefault ? `${image.Name} (default)` : image.Name,
        value: image.Name,
      }));
    } catch {
      this.imageOptions = [];
    }
  }

  async refreshDefaults(): Promise<void> {
    this.loading.set(true);
    this.failure.set(null);
    try {
      const entries = await this.pageLoading.runAndShowIndicatorIf(true, () =>
        wailsApi.getPlayroomDefaults(),
      );
      const rows = entries.map((entry) => ({
        ...entry,
        draft: entry.Value || entry.Builtin,
        dirty: false,
      }));
      this.rows.set(rows);
      this.initSliderValues(rows);
    } catch (e) {
      // Without this the panel renders blank, with only an expiring toast.
      this.failure.set(explainFailure(e));
      this.rows.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private initSliderValues(rows: DefaultRow[]): void {
    for (const row of rows) {
      const field = FIELD_BY_KEY.get(row.Key);
      if (field?.kind !== 'slider') continue;
      const opts = this.sliderOptions(field);
      const idx = opts.indexOf(row.draft);
      this.sliderValues[row.Key] = idx >= 0 ? idx : Math.max(0, opts.indexOf(row.Builtin));
    }
  }

  sliderOptions(field: DefaultField): string[] {
    return (field.options ?? []) as string[];
  }

  sliderMax(field: DefaultField): number {
    return Math.max(0, this.sliderOptions(field).length - 1);
  }

  readonly sliderStep = SLIDER_STEP;

  /** Where a tick sits on the track, as a percentage of its full travel. */
  tickPosition(field: DefaultField, index: number): number {
    const count = this.sliderOptions(field).length;
    if (count <= 1) return 0;
    return (index / (count - 1)) * 100;
  }

  /**
   * The label under the handle while dragging: the nearest stop, not the one you
   * have fully passed.
   */
  sliderCurrentLabel(row: DefaultViewRow): string {
    const idx = Math.round(this.sliderValues[row.Key] ?? 0);
    return this.sliderOptions(row.field)[idx] ?? '';
  }

  /** Committed on release: snap to the nearest stop and store its value. */
  onSliderChange(row: DefaultViewRow, idx: number | number[]): void {
    const raw = Array.isArray(idx) ? idx[0] : idx;
    const options = this.sliderOptions(row.field);
    const snapped = Math.min(Math.max(Math.round(raw), 0), Math.max(0, options.length - 1));
    // Writing the rounded value back settles the handle onto the stop.
    this.sliderValues[row.Key] = snapped;
    this.markDirty(row.Key, options[snapped] ?? '');
  }

  selectOptions(field: DefaultField): { label: string; value: string }[] {
    if (field.dynamicOptions === 'images') return this.imageOptions;
    return (field.options ?? []) as { label: string; value: string }[];
  }

  toggleValue(row: DefaultRow): boolean {
    return row.draft === 'true';
  }

  setToggle(key: string, val: boolean): void {
    this.markDirty(key, val ? 'true' : 'false');
  }

  markDirty(key: string, value: string): void {
    this.rows.update((rows) =>
      rows.map((row) =>
        row.Key === key
          ? { ...row, draft: value, dirty: value !== (row.Value || row.Builtin) }
          : row,
      ),
    );
  }

  async saveDefaults(): Promise<void> {
    this.saving.set(true);
    const dirty = this.rows().filter((row) => row.dirty);
    try {
      for (const row of dirty) {
        const clearing = row.draft === '' || row.draft === row.Builtin;
        await this.console.run(
          clearing ? `Clearing default "${row.Key}"` : `Setting default "${row.Key}"`,
          (operationId) =>
            clearing
              ? wailsApi.unsetPlayroomDefault(operationId, row.Key)
              : wailsApi.setPlayroomDefault(operationId, row.Key, row.draft),
        );
      }
      this.notify.show({ severity: 'success', detail: 'Defaults saved', life: 2500 });
      await this.reloadAfterWrite();
    } catch (e) {
      this.notify.failure('Could not save the defaults', e);
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * Clears every configured default through `playroom config unset --all`:
   * resetting is a mutation, so it runs the command that performs it.
   */
  async resetAll(): Promise<void> {
    this.saving.set(true);
    try {
      await this.console.run('Clearing all playroom defaults', (operationId) =>
        wailsApi.unsetAllPlayroomDefaults(operationId),
      );
      this.notify.show({ severity: 'success', detail: 'Defaults reset to built-ins', life: 2500 });
      await this.reloadAfterWrite();
    } catch (e) {
      this.notify.failure('Could not reset the defaults', e);
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * Re-reads this screen and drops the app-wide cache, so other screens seed
   * from the new values rather than the ones they opened with.
   */
  private async reloadAfterWrite(): Promise<void> {
    this.defaults.forgetCachedDefaults();
    await this.refreshDefaults();
  }

  goBack(): void {
    void this.router.navigate(['/rooms']);
  }

  sourceSeverity(source: string): 'success' | 'secondary' | 'info' {
    if (source === 'config') return 'success';
    if (source === 'cache') return 'info';
    return 'secondary';
  }
}

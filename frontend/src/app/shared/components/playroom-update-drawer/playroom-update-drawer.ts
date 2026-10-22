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
  PlayroomLifecycleService,
  updateInputFor,
} from '../../../core/services/playroom-lifecycle';
import { ImageCatalogService } from '../../../core/services/image-catalog';
import { PlayroomStateService } from '../../../core/services/playroom-state';
import { UiSessionService } from '../../../core/services/ui-session';
import { PlayroomUpdateInput, wailsApi } from '../../../core/services/wails-api';
import { CAPABILITIES } from '../../data';
import { ImageEntry, Playroom, UpdateForm } from '../../models';
import { blankUpdateForm, findImageEntry, storageDoesNotGrow } from '../../utils';
import { CommandPreviewComponent } from '../command-preview/command-preview';
import { StringListEditorComponent } from '../string-list-editor/string-list-editor';
import { OverlayFocusDirective } from '../../directives';

/** Stands in for [room] until one is given, so the form always has every field. */
const EMPTY_ROOM: Playroom = {
  name: '',
  owner: '',
  status: 'unknown',
  rawStatus: '',
  ageMin: 0,
  disk: '',
  diskType: '',
  host: '',
  image: '',
  cpuReq: '',
  cpuLim: '',
  memReq: '',
  memLim: '',
  ports: '',
  system: '',
  playhouse: '',
  ephemeral: false,
  env: [],
  git: [],
  copy: [],
};

/**
 * The "update playroom" drawer, seeded from [room] each time it opens. The save
 * goes to PlayroomLifecycleService.
 */
@Component({
  selector: 'app-playroom-update-drawer',
  imports: [
    FormsModule,
    DrawerModule,
    ButtonModule,
    SelectModule,
    InputTextModule,
    ToggleSwitchModule,
    CommandPreviewComponent,
    StringListEditorComponent,
    OverlayFocusDirective,
  ],
  templateUrl: './playroom-update-drawer.html',
  styleUrl: './playroom-update-drawer.css',
})
export class PlayroomUpdateDrawerComponent implements OnChanges, OnDestroy {
  private readonly actions = inject(PlayroomLifecycleService);
  private readonly imageCatalog = inject(ImageCatalogService);
  private readonly session = inject(UiSessionService);
  private readonly state = inject(PlayroomStateService);
  submitting = false;
  submitFailure = '';

  /** Backend-generated, so the preview is the arguments that will run. */
  readonly previewUpdate = wailsApi.previewUpdatePlayroom;

  images: ImageEntry[] = [];

  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Input() room: Playroom | null = null;

  form: UpdateForm = blankUpdateForm(EMPTY_ROOM);
  /** Set on blur, so a half-typed size such as "3" on the way to "30Gi" is not called too small. */
  storageTouched = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible && this.room) {
      this.form =
        this.session.recall<UpdateForm>('update:' + this.room.name) ?? blankUpdateForm(this.room);
      this.storageTouched = false;
      void this.loadImages();
    }
  }

  /**
   * Loads the selectable playroom images from the backend, keeping the room's
   * current one even when it is not a published flavor.
   */
  async loadImages(): Promise<void> {
    try {
      this.images = await this.imageCatalog.loadImageCatalogOnce();
    } catch {
      this.images = [];
    }
  }

  readonly capabilitiesOptions = [
    { id: '', label: 'Keep current', hint: "Leaves the room's profile as it is" },
    ...CAPABILITIES,
  ];

  selectedImage(): ImageEntry | undefined {
    return findImageEntry(this.images, this.form.image);
  }

  /** `--workspace-namespace=false` deletes the namespace and everything in it. */
  removesWorkspaceNamespace(): boolean {
    return this.form.changeWorkspaceNamespace && !this.form.workspaceNamespace;
  }

  /** Removing the namespace deletes what is in it, so the button says so. */
  updateButtonLabel(): string {
    return this.removesWorkspaceNamespace() ? 'Update and delete namespace' : 'Update';
  }

  updateButtonSeverity(): 'danger' | null {
    return this.removesWorkspaceNamespace() ? 'danger' : null;
  }

  /** acloud refuses a size that does not grow the volume, so refuse it here first. */
  storageError(): string {
    const currentSize = this.room?.disk ?? '';
    if (this.storageTouched && storageDoesNotGrow(currentSize, this.form.storage)) {
      return `Storage can only grow: pick more than ${currentSize}.`;
    }
    return '';
  }

  /** Whatever is stopping Update, said next to the disabled button. */
  blockingError(): string {
    if (this.removesWorkspaceNamespace() && !this.form.acknowledgeWorkspaceNamespaceRemoval) {
      return 'Confirm that the namespace and everything in it may be deleted.';
    }
    return this.storageError();
  }

  previewInput(): Partial<PlayroomUpdateInput> {
    return updateInputFor(this.form);
  }
  onVisibleChange(value: boolean): void {
    if (this.submitting) return;
    if (!value) this.rememberDraft();
    this.visible = value;
    this.visibleChange.emit(value);
  }

  close(): void {
    this.onVisibleChange(false);
  }

  private rememberDraft(): void {
    if (this.form.playhouse === this.state.playhouse())
      this.session.remember('update:' + this.form.name, this.form);
  }

  ngOnDestroy(): void {
    if (this.visible) this.rememberDraft();
  }

  discardDraft(): void {
    if (!this.room || this.submitting) return;
    this.session.forget('update:' + this.room.name);
    this.form = blankUpdateForm(this.room);
    this.storageTouched = false;
    this.submitFailure = '';
  }

  async save(): Promise<void> {
    if (this.submitting) return;
    this.storageTouched = true;
    if (this.blockingError()) return;
    const form = this.form;
    this.submitting = true;
    this.rememberDraft();
    try {
      if (await this.actions.update(form)) {
        this.session.forget('update:' + form.name);
        this.submitting = false;
        this.visible = false;
        this.visibleChange.emit(false);
      } else {
        this.submitFailure =
          'Update failed. Your changes are kept; check Activity, then try again.';
      }
    } finally {
      this.submitting = false;
    }
  }
}

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
import { PlayroomUpdateInput, wailsApi } from '../../../core/services/wails-api';
import { CAPABILITIES } from '../../data';
import { ImageEntry, Playroom, UpdateForm } from '../../models';
import { blankUpdateForm, findImageEntry } from '../../utils';
import { CommandPreviewComponent } from '../command-preview/command-preview';
import { StringListEditorComponent } from '../string-list-editor/string-list-editor';

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
  ],
  templateUrl: './playroom-update-drawer.html',
  styleUrl: './playroom-update-drawer.css',
})
export class PlayroomUpdateDrawerComponent implements OnChanges {
  private readonly actions = inject(PlayroomLifecycleService);
  private readonly imageCatalog = inject(ImageCatalogService);

  /** Backend-generated, so the preview is the arguments that will run. */
  readonly previewUpdate = wailsApi.previewUpdatePlayroom;

  images: ImageEntry[] = [];

  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Input() room: Playroom | null = null;

  form: UpdateForm = blankUpdateForm(EMPTY_ROOM);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible && this.room) {
      this.form = blankUpdateForm(this.room);
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
    { id: '', label: 'Keep current' },
    ...CAPABILITIES.map(({ id, label }) => ({ id, label })),
  ];

  selectedImage(): ImageEntry | undefined {
    return findImageEntry(this.images, this.form.image);
  }

  /** `--workspace-namespace=false` deletes the namespace and everything in it. */
  removesWorkspaceNamespace(): boolean {
    return this.form.changeWorkspaceNamespace && !this.form.workspaceNamespace;
  }

  /** Whatever is stopping Update, said next to the disabled button. */
  blockingError(): string {
    if (this.removesWorkspaceNamespace() && !this.form.acknowledgeWorkspaceNamespaceRemoval) {
      return 'Confirm that the namespace and everything in it may be deleted.';
    }
    return '';
  }

  previewInput(): Partial<PlayroomUpdateInput> {
    return updateInputFor(this.form);
  }
  onVisibleChange(value: boolean): void {
    this.visible = value;
    this.visibleChange.emit(value);
  }

  close(): void {
    this.onVisibleChange(false);
  }

  async save(): Promise<void> {
    if (this.blockingError()) return;
    const form = this.form;
    this.close();
    await this.actions.update(form);
  }
}

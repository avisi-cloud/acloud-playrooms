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
import { DEFAULTS } from '../../data';
import { ImageEntry, Playroom, UpdateForm } from '../../models';
import { blankUpdateForm } from '../../utils';
import { CommandPreviewComponent } from '../command-preview/command-preview';
import { StringListEditorComponent } from '../string-list-editor/string-list-editor';

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

  form: UpdateForm = {
    name: '',
    playhouse: '',
    image: '',
    cpuReq: '',
    cpuLim: '',
    memReq: '',
    memLim: '',
    changeReadOnly: false,
    readOnly: true,
    changePorts: false,
    clearPorts: false,
    ports: [''],
    noWait: false,
    waitTimeout: DEFAULTS.waitTimeout,
  };

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
    const form = this.form;
    this.close();
    await this.actions.update(form);
  }
}

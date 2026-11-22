import { Injectable, signal } from '@angular/core';
import type { CreateForm } from '../../shared/models';
import type { PlayroomTemplate } from '../../shared/models/playroom-template';
import {
  templateFromCreateForm,
  validatePlayroomTemplates,
} from '../../shared/utils/playroom-template';
import { describeError } from '../../shared/utils/cli-error';
import { wailsApi } from './wails-api';

@Injectable({ providedIn: 'root' })
export class PlayroomTemplatesService {
  readonly templates = signal<PlayroomTemplate[]>([]);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly loaded = signal(false);

  async loadTemplates(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      this.templates.set(await wailsApi.getPlayroomTemplates());
      this.loaded.set(true);
      this.error.set('');
    } catch (error) {
      this.loaded.set(false);
      this.error.set(describeError(error));
    } finally {
      this.busy.set(false);
    }
  }

  saveTemplate(name: string, form: CreateForm): Promise<boolean> {
    return this.changeTemplates(() => [...this.templates(), templateFromCreateForm(name, form)]);
  }

  renameTemplate(template: PlayroomTemplate, name: string): Promise<boolean> {
    return this.changeTemplates(() =>
      this.templates().map((entry) =>
        entry.name === template.name ? { ...entry, name: name.trim() } : entry,
      ),
    );
  }

  deleteTemplate(template: PlayroomTemplate): Promise<boolean> {
    return this.changeTemplates(() =>
      this.templates().filter((entry) => entry.name !== template.name),
    );
  }

  importTemplates(): Promise<boolean> {
    return this.changeTemplates(async () => {
      const imported = await wailsApi.importPlayroomTemplates();
      return imported.length ? [...this.templates(), ...imported] : null;
    });
  }

  async exportTemplate(template: PlayroomTemplate): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await wailsApi.exportPlayroomTemplate(template);
      this.error.set('');
    } catch (error) {
      this.error.set(describeError(error));
    } finally {
      this.busy.set(false);
    }
  }

  private async changeTemplates(
    change: () => PlayroomTemplate[] | null | Promise<PlayroomTemplate[] | null>,
  ): Promise<boolean> {
    if (this.busy()) return false;
    if (!this.loaded()) {
      this.error.set('Load templates successfully before changing them.');
      return false;
    }
    this.busy.set(true);
    try {
      const templates = await change();
      if (!templates) return false;
      validatePlayroomTemplates(templates);
      await wailsApi.savePlayroomTemplates(templates);
      this.templates.set(templates);
      this.error.set('');
      return true;
    } catch (error) {
      this.error.set(describeError(error));
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}

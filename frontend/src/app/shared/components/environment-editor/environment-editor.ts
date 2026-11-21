import { Component, effect, inject, model, signal } from '@angular/core';
import { EnvironmentService } from '../../../core/services/environment';
import { wailsApi } from '../../../core/services/wails-api';
import { StringListEditorComponent } from '../string-list-editor/string-list-editor';
import { PLAYROOM_OPTION_TEXTS } from '../../data';

@Component({
  selector: 'app-environment-editor',
  imports: [StringListEditorComponent],
  template: `<app-string-list-editor
    [label]="optionTexts.env.label"
    [hint]="optionTexts.env.hint"
    [values]="values()"
    (valuesChange)="values.set($event)"
    [itemHints]="hints()"
    placeholder="ANTHROPIC_API_KEY"
    addLabel="add env var"
    itemLabel="environment variable"
  />`,
})
export class EnvironmentEditorComponent {
  readonly values = model.required<string[]>();
  readonly hints = signal<string[]>([]);
  readonly optionTexts = PLAYROOM_OPTION_TEXTS;
  private readonly environment = inject(EnvironmentService);

  constructor() {
    effect((onCleanup) => {
      const entries = this.values();
      const readShell = this.environment.readVariablesFromLoginShell();
      let active = true;
      const inlineHint =
        'The value ends up in the command line. Use the bare KEY form to forward it privately.';
      const initial = entries.map((entry) =>
        !entry.trim() ? '' : entry.includes('=') ? inlineHint : 'Checking…',
      );
      this.hints.set(initial);
      const timer = setTimeout(() => {
        void wailsApi
          .getEnvironmentPresence(entries, readShell)
          .then((presence) => {
            if (active)
              this.hints.set(
                entries.map((entry, index) => {
                  if (!entry.trim() || entry.includes('=')) return initial[index];
                  const result = presence.find((item) => item.Key === entry.trim());
                  return result ? (result.Set ? 'Set' : 'Not set') : 'Not reported';
                }),
              );
          })
          .catch(() => {
            if (active)
              this.hints.set(
                entries.map((entry, index) =>
                  entry.includes('=') || !entry.trim()
                    ? initial[index]
                    : 'Could not check. Check your login shell setting and try again.',
                ),
              );
          });
      }, 250);
      onCleanup(() => {
        active = false;
        clearTimeout(timer);
      });
    });
  }
}

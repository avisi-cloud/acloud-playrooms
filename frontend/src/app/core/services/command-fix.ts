import { Injectable, WritableSignal, inject, signal } from '@angular/core';
import { commandFix, CommandFix } from '../../shared/utils/cli-error';
import { PlayroomSelection, PlayroomStateService } from './playroom-state';
import { ToastService } from './toast';

export interface FailureAction {
  label: string;
  busy: WritableSignal<boolean>;
  run: () => Promise<void>;
}

const LABELS: Record<CommandFix, string> = {
  signIn: 'Sign in to the playhouse again',
  updatePlayroom: 'Update playroom',
  options: 'Go to Options',
};

@Injectable({ providedIn: 'root' })
export class CommandFixService {
  private readonly state = inject(PlayroomStateService);
  private readonly notify = inject(ToastService);

  action(
    error: unknown,
    handlers: Partial<Record<CommandFix, () => void | Promise<unknown>>>,
    selection: PlayroomSelection = this.state.captureSelection(),
  ): FailureAction | undefined {
    const fix = commandFix(error);
    const handler = fix ? handlers[fix] : undefined;
    if (!fix || !handler) return undefined;
    const busy = signal(false);
    return {
      label: LABELS[fix],
      busy,
      run: async () => {
        if (busy()) return;
        if (!this.state.isCurrentSelection(selection)) {
          this.notify.toast(
            'This fix belongs to an earlier selection. Run the command again in the current playhouse.',
            'warn',
          );
          return;
        }
        busy.set(true);
        try {
          await handler();
        } catch (error) {
          this.notify.failure('Could not apply the fix', error);
        } finally {
          busy.set(false);
        }
      },
    };
  }
}

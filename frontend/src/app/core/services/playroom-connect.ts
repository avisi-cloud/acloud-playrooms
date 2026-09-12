import { Injectable, inject } from '@angular/core';
import { Playroom } from '../../shared/models';
import { updateCache } from '../../shared/utils';
import { CliConsoleService } from './cli-console';
import { PlayroomConnectInput, wailsApi } from './wails-api';

/**
 * The "connect in terminal" and "open in editor" flows, plus the cache writes
 * that record the last-used playroom, terminal and editor.
 */
@Injectable({ providedIn: 'root' })
export class PlayroomConnectService {
  private readonly console = inject(CliConsoleService);

  /**
   * Hands `acloud playroom connect` to the user's terminal, since an SSH session
   * needs a real TTY. Returns the activity-log id, so a toast can link to it.
   */
  async connect(
    room: Playroom,
    user: string,
    terminal: string,
    forwardAgent: boolean,
    tunnel = false,
  ): Promise<string> {
    const input: Partial<PlayroomConnectInput> = {
      Name: room.name,
      Playhouse: room.playhouse,
      User: user,
      ForwardAgent: forwardAgent,
      Tunnel: tunnel,
      Terminal: terminal,
    };
    await wailsApi.connectPlayroom(input);
    updateCache({ lastPlayroom: room.name, lastPlayhouse: room.playhouse, lastTerminal: terminal });
    return this.console.recordHandoff(await this.commandFor(input), terminal || 'your terminal');
  }

  /** Opens the playroom in a desktop editor. No TTY needed, so it streams. */
  async open(room: Playroom, editor: string, tunnel = false): Promise<void> {
    await this.console.run(`Opening "${room.name}" in ${editor}`, (operationId) =>
      wailsApi.openPlayroomInEditor(operationId, {
        Name: room.name,
        Playhouse: room.playhouse,
        Editor: editor,
        Tunnel: tunnel,
      }),
    );
    updateCache({ lastPlayroom: room.name, lastPlayhouse: room.playhouse, lastEditor: editor });
  }

  /**
   * The command line that was handed off, from the backend rather than rebuilt.
   * A failure here must not fail the connect, which already happened.
   */
  private async commandFor(input: Partial<PlayroomConnectInput>): Promise<string> {
    try {
      return (await wailsApi.previewConnectPlayroom(input)).join(' ');
    } catch {
      return `acloud playroom connect ${input.Name ?? ''}`.trim();
    }
  }
}

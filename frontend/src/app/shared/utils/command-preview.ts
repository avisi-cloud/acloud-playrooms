import { signal } from '@angular/core';

/**
 * Holds the CLI command for a form. It comes from Go, since it is the very
 * arguments that will run, so the input is fingerprinted to skip the IPC hop.
 */
export class CommandPreview<T> {
  private readonly _command = signal('');
  readonly command = this._command.asReadonly();

  private fingerprint = '';
  private sequence = 0;

  constructor(private readonly fetch: (input: T) => Promise<string[]>) {}

  /** Call whenever the form may have changed; cheap when it has not. */
  refreshIfInputChanged(input: T): void {
    const fingerprint = JSON.stringify(input);
    if (fingerprint === this.fingerprint) return;
    this.fingerprint = fingerprint;

    const sequence = ++this.sequence;
    void this.fetch(input)
      .then((commandArguments) => {
        // Drop a slow response that a newer one has already overtaken.
        if (sequence === this.sequence) this._command.set(commandArguments.join(' '));
      })
      .catch(() => {
        if (sequence === this.sequence) this._command.set('');
      });
  }

  /** Clears the preview, e.g. when a drawer is reopened on a fresh form. */
  clear(): void {
    this.fingerprint = '';
    this.sequence++;
    this._command.set('');
  }
}

export interface CommandPart {
  text: string;
  kind: 'flag' | 'value' | 'space';
}

// Preserve quoting and whitespace from the backend's shell preview.
export function splitCommandPreview(command: string): CommandPart[] {
  const tokens = command.match(/(?:'[^']*'|"(?:\\.|[^"\\])*"|\\.|[^\s'"])+|\s+/g) ?? [];
  let flagsEnded = false;
  return tokens.flatMap((text): CommandPart[] => {
    if (/^\s+$/.test(text)) return [{ text, kind: 'space' }];
    if (flagsEnded) return [{ text, kind: 'value' }];
    if (text === '--') {
      flagsEnded = true;
      return [{ text, kind: 'flag' }];
    }
    if (!/^--?[a-zA-Z]/.test(text)) return [{ text, kind: 'value' }];
    const equal = text.indexOf('=');
    return equal < 0
      ? [{ text, kind: 'flag' }]
      : [
          { text: text.slice(0, equal + 1), kind: 'flag' },
          { text: text.slice(equal + 1), kind: 'value' },
        ];
  });
}

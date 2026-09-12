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

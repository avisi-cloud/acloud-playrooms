import { Injectable, signal } from '@angular/core';
import { readCache, updateCache } from '../../shared/utils/cache';

@Injectable({ providedIn: 'root' })
export class EnvironmentService {
  readonly readVariablesFromLoginShell = signal(readCache().readVariablesFromLoginShell);

  setReadVariablesFromLoginShell(value: boolean): void {
    this.readVariablesFromLoginShell.set(value);
    updateCache({ readVariablesFromLoginShell: value });
  }
}

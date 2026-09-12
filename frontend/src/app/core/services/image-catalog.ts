import { Injectable } from '@angular/core';
import { ImageEntry } from '../../shared/models';
import { wailsApi } from './wails-api';

/** Session-wide catalog of the immutable playroom image flavors. */
@Injectable({ providedIn: 'root' })
export class ImageCatalogService {
  private entries: ImageEntry[] | null = null;
  private pending: Promise<ImageEntry[]> | null = null;

  loadImageCatalogOnce(): Promise<ImageEntry[]> {
    if (this.entries) return Promise.resolve(this.entries);
    if (this.pending) return this.pending;

    this.pending = wailsApi
      .listPlayroomImages()
      .then((entries) => {
        this.entries = entries;
        return entries;
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }
}

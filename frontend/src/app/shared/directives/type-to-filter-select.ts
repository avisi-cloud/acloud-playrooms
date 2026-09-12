import { Directive, HostListener, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Select } from 'primeng/select';

/**
 * Lets an editable p-select be searched from its own input, so there are not two
 * places to type for one choice. The filter is dropped when the panel closes.
 */
@Directive({ selector: 'p-select[appTypeToFilter]' })
export class TypeToFilterSelectDirective {
  private readonly select = inject(Select, { self: true });

  constructor() {
    this.select.onHide.pipe(takeUntilDestroyed()).subscribe(() => {
      this.select.filterValue = '';
    });
  }

  /** Fires for the editable input, the only input inside an unfiltered select. */
  @HostListener('input', ['$event'])
  narrowOptionsToTypedText(event: Event): void {
    this.select.filterValue = (event.target as HTMLInputElement).value;
  }
}

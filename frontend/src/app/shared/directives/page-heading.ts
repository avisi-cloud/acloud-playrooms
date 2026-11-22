import { Directive, ElementRef, Injector, afterNextRender, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';

@Directive({ selector: '[appPageHeading]', host: { tabindex: '-1' } })
export class PageHeadingDirective {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  constructor() {
    this.focusAfterRender();
    inject(Router, { optional: true })
      ?.events.pipe(takeUntilDestroyed())
      .subscribe((event) => {
        if (event instanceof NavigationEnd) this.focusAfterRender();
      });
  }

  private focusAfterRender(): void {
    afterNextRender(
      () => {
        if (!document.querySelector('[role="dialog"][aria-modal="true"]'))
          this.element.nativeElement.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
  }
}

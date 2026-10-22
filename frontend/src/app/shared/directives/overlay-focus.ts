import { Directive, Input, OnChanges, OnDestroy, SimpleChanges, inject } from '@angular/core';
import { Drawer } from 'primeng/drawer';
import { Dialog } from 'primeng/dialog';

/** Complements PrimeNG's focus trap: name the actual portalled panel, move
 * focus inside on open, and return it to its invoker on dismissal. */
@Directive({ selector: 'p-drawer[appOverlayFocus], p-dialog[appOverlayFocus]' })
export class OverlayFocusDirective implements OnChanges, OnDestroy {
  @Input() appOverlayFocus = '';
  @Input() appOverlayVisible = false;
  private readonly drawer = inject(Drawer, { optional: true });
  private readonly dialog = inject(Dialog, { optional: true });
  private opener: HTMLElement | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly shown = (this.drawer ?? this.dialog)!.onShow.subscribe(() => {
    this.timer = setTimeout(() => {
      const panel = this.drawer?.container ?? this.dialog?.container();
      if (!panel || !this.appOverlayVisible) return;
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-label', this.appOverlayFocus);
      panel.removeAttribute('aria-labelledby');
      const field = panel.querySelector<HTMLElement>(
        '[data-initial-focus], input:not([disabled]), [role="combobox"], textarea, button:not([disabled])',
      );
      (field ?? panel).focus();
    });
  });
  private readonly hidden = (this.drawer ?? this.dialog)!.onHide.subscribe(() => {
    if (this.opener?.isConnected) this.opener.focus({ preventScroll: true });
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['appOverlayVisible'] && this.appOverlayVisible)
      this.opener = document.activeElement as HTMLElement | null;
  }
  ngOnDestroy(): void {
    clearTimeout(this.timer);
    this.shown.unsubscribe();
    this.hidden.unsubscribe();
  }
}

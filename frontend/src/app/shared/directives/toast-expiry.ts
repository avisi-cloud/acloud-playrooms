import { Directive, Input, OnDestroy, OnInit } from '@angular/core';
import { NOTIFICATION_DURATION_MS } from '../../core/services/toast';

@Directive({ selector: '[appToastExpiry]' })
export class ToastExpiryDirective implements OnInit, OnDestroy {
  @Input({ required: true }) appToastExpiry!: (event: Event) => void;
  private timer?: ReturnType<typeof setTimeout>;

  // The independent deadline keeps hovering from leaving notifications on screen.
  ngOnInit(): void {
    this.timer = setTimeout(
      () => this.appToastExpiry(new Event('timeout')),
      NOTIFICATION_DURATION_MS,
    );
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }
}

import { Directive, ElementRef, afterEveryRender, inject, input } from '@angular/core';

// PrimeNG renders its focusable input inside the host carrying the field hint.
@Directive({ selector: '[appFieldDescription]' })
export class FieldDescriptionDirective {
  readonly appFieldDescription = input.required<string>();
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterEveryRender(() => {
      const control = this.element.nativeElement.querySelector<HTMLElement>(
        'input, [role="combobox"], [role="switch"]',
      );
      control?.setAttribute('aria-describedby', this.appFieldDescription());
    });
  }
}

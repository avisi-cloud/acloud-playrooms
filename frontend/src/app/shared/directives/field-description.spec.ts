import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { FieldDescriptionDirective } from './field-description';

@Component({
  imports: [FormsModule, SelectModule, ToggleSwitchModule, FieldDescriptionDirective],
  template: `
    <p-select
      inputId="image"
      ariaLabel="Image"
      [options]="['one', 'two']"
      [(ngModel)]="image"
      appFieldDescription="image-hint"
    />
    <p-toggleswitch inputId="enabled" [(ngModel)]="enabled" appFieldDescription="toggle-hint" />
    <small id="image-hint">Choose an image.</small>
    <small id="toggle-hint">Enable this option.</small>
  `,
})
class TestFormComponent {
  image = 'one';
  enabled = false;
}

it('describes the inner PrimeNG controls and keeps the image name stable after a value change', async () => {
  const fixture = TestBed.createComponent(TestFormComponent);
  await fixture.whenStable();
  const root: HTMLElement = fixture.nativeElement;
  expect(root.querySelector('[role="combobox"]')?.getAttribute('aria-describedby')).toBe(
    'image-hint',
  );
  expect(root.querySelector('[role="switch"]')?.getAttribute('aria-describedby')).toBe(
    'toggle-hint',
  );
  fixture.componentInstance.image = 'two';
  fixture.changeDetectorRef.markForCheck();
  await fixture.whenStable();
  expect(root.querySelector('[role="combobox"]')?.getAttribute('aria-label')).toBe('Image');
});

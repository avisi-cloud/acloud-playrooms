import { TestBed } from '@angular/core/testing';
import { ConfirmDeleteDialog } from './confirm-delete-dialog';

it('names the rendered close button and dismisses the delete confirmation', async () => {
  const fixture = TestBed.createComponent(ConfirmDeleteDialog);
  fixture.componentRef.setInput('visible', true);
  fixture.componentRef.setInput('title', 'Delete selected playrooms');
  fixture.componentRef.setInput('confirmTarget', 'delete');
  const visibleChange = vi.fn();
  fixture.componentInstance.visibleChange.subscribe(visibleChange);
  await fixture.whenStable();
  fixture.detectChanges();

  const close = document.querySelector(
    '.av-dialog button[aria-label="Close"]',
  ) as HTMLButtonElement;
  expect(close).not.toBeNull();
  close.click();
  expect(visibleChange).toHaveBeenCalledExactlyOnceWith(false);
  fixture.destroy();
});

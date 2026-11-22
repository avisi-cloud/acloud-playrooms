import { Subject } from 'rxjs';
import { NavigationEnd, Router } from '@angular/router';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PageHeadingDirective } from './page-heading';

@Component({
  imports: [PageHeadingDirective],
  template: `@if (loaded()) {
    <h1 appPageHeading>Playroom details</h1>
  }`,
})
class TestPageComponent {
  readonly loaded = signal(false);
}

it('focuses the heading when an asynchronously loaded page renders it', async () => {
  const fixture = TestBed.createComponent(TestPageComponent);
  await fixture.whenStable();
  fixture.componentInstance.loaded.set(true);
  await fixture.whenStable();
  expect(document.activeElement).toBe(fixture.nativeElement.querySelector('h1'));
  expect(document.activeElement?.getAttribute('tabindex')).toBe('-1');
});

it('keeps focus in an already open modal', async () => {
  const modal = document.createElement('div');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.tabIndex = -1;
  document.body.append(modal);
  modal.focus();
  try {
    const fixture = TestBed.createComponent(TestPageComponent);
    fixture.componentInstance.loaded.set(true);
    await fixture.whenStable();
    expect(document.activeElement).toBe(modal);
  } finally {
    modal.remove();
  }
});

it('refocuses a heading when navigation reuses the same page component', async () => {
  const events = new Subject<NavigationEnd>();
  TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: { events } }] });
  const fixture = TestBed.createComponent(TestPageComponent);
  fixture.componentInstance.loaded.set(true);
  await fixture.whenStable();
  const heading = fixture.nativeElement.querySelector('h1') as HTMLElement;
  heading.blur();
  events.next(new NavigationEnd(2, '/rooms/other', '/rooms/other'));
  fixture.detectChanges();
  await fixture.whenStable();
  expect(document.activeElement).toBe(heading);
});

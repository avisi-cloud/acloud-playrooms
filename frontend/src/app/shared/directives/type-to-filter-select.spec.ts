import { Component, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Select, SelectModule } from 'primeng/select';
import { TypeToFilterSelectDirective } from './type-to-filter-select';

interface Account {
  name: string;
  provider: string;
}

@Component({
  imports: [SelectModule, TypeToFilterSelectDirective],
  template: `
    <p-select
      appTypeToFilter
      [options]="options"
      optionLabel="name"
      [editable]="true"
      filterBy="name,provider"
    />
  `,
})
class HostComponent {
  readonly select = viewChild.required(Select);
  options: Account[] = [
    { name: 'avisi-prod', provider: 'aws' },
    { name: 'avisi-test', provider: 'aws' },
    { name: 'customer-one', provider: 'azure' },
  ];
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The editable input is the select's only input once the panel filter is gone. */
const type = (root: HTMLElement, value: string) => {
  const input = root.querySelector('input')!;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('TypeToFilterSelectDirective', () => {
  // Typing opens the panel, and PrimeNG's overlay asks the window for its
  // breakpoint. jsdom has no matchMedia, so the panel would throw on render.
  beforeAll(() => {
    window.matchMedia ??= ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
  });

  it('narrows the options to what was typed in the select itself', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const select = fixture.componentInstance.select();

    type(fixture.nativeElement, 'avisi');
    await flush();
    fixture.detectChanges();

    expect(select.visibleOptions().map((o: Account) => o.name)).toEqual([
      'avisi-prod',
      'avisi-test',
    ]);
  });

  it('searches every field named by filterBy, not just the label', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const select = fixture.componentInstance.select();

    type(fixture.nativeElement, 'azure');
    await flush();
    fixture.detectChanges();

    expect(select.visibleOptions().map((o: Account) => o.name)).toEqual(['customer-one']);
  });

  it('drops the filter when the panel closes, so re-opening shows everything', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const select = fixture.componentInstance.select();

    type(fixture.nativeElement, 'avisi');
    await flush();
    // What PrimeNG calls once the panel has animated away — jsdom never runs
    // that animation, so the close is driven by hand.
    select.hide();
    select.onOverlayAfterLeave(new Event('transitionend'));
    await flush();
    fixture.detectChanges();

    expect(select.visibleOptions()).toHaveLength(3);
  });
});

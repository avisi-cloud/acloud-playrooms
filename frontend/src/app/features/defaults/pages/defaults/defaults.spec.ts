import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { Slider } from 'primeng/slider';
import { wailsApi } from '../../../../core/services/wails-api';
import {
  DEFAULT_FIELDS,
  DefaultsPageComponent,
  labelForDefaultKey,
  labelSpellsOutKey,
} from './defaults';

const RESOURCE_KEYS = ['cpu-request', 'cpu-limit', 'memory-request', 'memory-limit'];

describe('Defaults field registry', () => {
  // acloud accepts `none` for these four, and a slider can only offer what is
  // in its options list.
  it('offers none as a stop on every resource slider', () => {
    for (const key of RESOURCE_KEYS) {
      const field = DEFAULT_FIELDS.find((candidate) => candidate.key === key);
      expect(field, key).toBeDefined();
      expect(field?.options as string[], key).toContain('none');
      // First, so "unset" sits at one end of the track rather than mid-scale.
      expect((field?.options as string[])[0], key).toBe('none');
    }
  });

  it('defines every field exactly once', () => {
    const keys = DEFAULT_FIELDS.map((field) => field.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every slider and static select usable options', () => {
    for (const field of DEFAULT_FIELDS) {
      if (field.kind === 'slider') expect(field.options?.length, field.key).toBeGreaterThan(1);
      if (field.kind === 'select' && !field.dynamicOptions) {
        expect(field.options?.length, field.key).toBeGreaterThan(0);
      }
    }
  });

  it('gives every key acloud 0.37 reports a proper control instead of a text box', () => {
    const expectedKinds: Record<string, string> = {
      exposure: 'select',
      capabilities: 'select',
      'workspace-namespace': 'toggle',
      privileged: 'toggle',
    };
    for (const [key, kind] of Object.entries(expectedKinds)) {
      expect(DEFAULT_FIELDS.find((field) => field.key === key)?.kind, key).toBe(kind);
    }
  });

  it('labels a key with the words the create and update drawers use', () => {
    expect(labelForDefaultKey('cpu-request')).toBe('Guaranteed CPU');
    expect(labelForDefaultKey('read-only')).toBe('Read-only system files');
  });

  it('gives every known key a plain label of its own', () => {
    for (const field of DEFAULT_FIELDS) {
      expect(labelForDefaultKey(field.key), field.key).not.toBe(field.key);
    }
  });

  it('shows the key only where the label uses other words', () => {
    expect(labelSpellsOutKey('image')).toBe(true);
    expect(labelSpellsOutKey('proxy-group')).toBe(true);
    expect(labelSpellsOutKey('cpu-request')).toBe(false);
    expect(labelSpellsOutKey('some-new-key')).toBe(true);
  });

  // A newer CLI may report keys this build has never seen; they keep their name.
  it('keeps the key itself as the label of a key it does not know', () => {
    expect(labelForDefaultKey('some-new-key')).toBe('some-new-key');
    expect(labelForDefaultKey('toString')).toBe('toString');
  });
});

describe('Defaults sliders', () => {
  beforeEach(async () => {
    vi.spyOn(wailsApi, 'getPlayroomDefaults').mockResolvedValue([
      { Key: 'storage', Value: '1Gi', Builtin: '1Gi', Source: 'built-in' },
    ]);
    vi.spyOn(wailsApi, 'listPlayroomImages').mockResolvedValue([]);
    await TestBed.configureTestingModule({
      imports: [DefaultsPageComponent],
      providers: [MessageService, provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => vi.restoreAllMocks());

  it('keeps command paths on Settings instead of mixing them with room defaults', async () => {
    const fixture = TestBed.createComponent(DefaultsPageComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('p-slider')).not.toBeNull();
    expect(root.querySelector('app-acloud-binary')).toBeNull();
    expect(root.querySelector('app-tailscale-binary')).toBeNull();
    expect(root.querySelector('app-t3-code-path')).toBeNull();
  });

  function sliderFor(key = 'storage') {
    const fixture = TestBed.createComponent(DefaultsPageComponent);
    const component = fixture.componentInstance;
    const field = DEFAULT_FIELDS.find((candidate) => candidate.key === key)!;
    const firstOption = (field.options as string[])[0];
    component.rows.set([
      {
        Key: key,
        Value: firstOption,
        Builtin: firstOption,
        Source: 'built-in',
        draft: firstOption,
        dirty: false,
      },
    ]);
    component.sliderValues[key] = 0;
    const row = component.groups()[0].rows[0];
    return { fixture, component, row };
  }

  it.each(DEFAULT_FIELDS.filter((field) => field.kind === 'slider').map((field) => field.key))(
    'moves %s continuously while choosing the nearest supported option',
    (key) => {
      const { component, row } = sliderFor(key);
      const options = component.sliderOptions(row.field);
      for (let index = 0; index < options.length - 1; index++) {
        for (const fraction of [0.1, 0.49, 0.5, 0.51, 0.9]) {
          const position = index + fraction;
          component.onSliderChange(row, position);
          expect(component.sliderValues[key]).toBe(position);
          expect(component.rows()[0].draft).toBe(options[index + (fraction < 0.5 ? 0 : 1)]);
          expect(component.sliderCurrentLabel(row)).toBe(component.rows()[0].draft);
        }
      }
    },
  );

  it('crosses back below the midpoint without leaving an unsaved change', () => {
    const { component, row } = sliderFor();
    component.onSliderChange(row, 0.6);
    expect(component.rows()[0]).toMatchObject({ draft: '2Gi', dirty: true });
    component.onSliderChange(row, 0.4);
    expect(component.sliderValues['storage']).toBe(0.4);
    expect(component.rows()[0]).toMatchObject({ draft: '1Gi', dirty: false });
  });

  it.each([
    [0.49, 0, '1Gi'],
    [0.5, 1, '2Gi'],
    [0.9, 1, '2Gi'],
  ] as const)(
    'settles at the nearest stop when released at %s',
    (position, stop, selectedOption) => {
      const { component, row } = sliderFor();
      component.onSliderEnd(row, position);
      expect(component.sliderValues['storage']).toBe(stop);
      expect(component.rows()[0].draft).toBe(selectedOption);
    },
  );

  it('keeps the thumb and selected option inside the track', () => {
    const { component, row } = sliderFor();
    component.onSliderChange(row, -0.5);
    expect(component.sliderValues['storage']).toBe(0);
    expect(component.rows()[0].draft).toBe('1Gi');
    component.onSliderChange(row, [7]);
    expect(component.sliderValues['storage']).toBe(6);
    expect(component.rows()[0].draft).toBe('100Gi');
  });

  it('wires fine movement separately from releasing the rendered slider', async () => {
    const fixture = TestBed.createComponent(DefaultsPageComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const slider = fixture.debugElement.query(By.directive(Slider)).componentInstance as Slider;
    expect(slider.step).toBe(0.01);
    slider.onModelChange(0.65);
    fixture.detectChanges();
    expect(component.sliderValues['storage']).toBe(0.65);
    expect(component.rows()[0].draft).toBe('2Gi');
    slider.onSlideEnd.emit({ value: 0.65, originalEvent: new Event('mouseup') });
    fixture.detectChanges();
    expect(component.sliderValues['storage']).toBe(1);
  });

  it('keeps keyboard navigation at whole settings despite fine pointer movement', async () => {
    const fixture = TestBed.createComponent(DefaultsPageComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const handle = fixture.nativeElement.querySelector('[role="slider"]') as HTMLElement;
    for (const [key, expectedStop] of [
      ['ArrowRight', 1],
      ['ArrowUp', 2],
      ['ArrowDown', 1],
      ['ArrowLeft', 0],
      ['PageUp', 1],
      ['PageDown', 0],
      ['End', 6],
      ['ArrowRight', 6],
      ['Home', 0],
      ['ArrowLeft', 0],
    ] as const) {
      handle.dispatchEvent(
        new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true }),
      );
      fixture.detectChanges();
      await fixture.whenStable();
      expect(component.sliderValues['storage'], key).toBe(expectedStop);
    }
    const unrelatedKey = new KeyboardEvent('keydown', {
      key: 'Tab',
      code: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    handle.dispatchEvent(unrelatedKey);
    expect(unrelatedKey.defaultPrevented).toBe(false);
  });
});

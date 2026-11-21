import { describeChanges } from './describe-changes';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { UpdatePlayhouseDrawerComponent } from './update-playhouse-drawer';
import { PlayhouseEntry } from '../../../../core/services/wails-api';

const playhouse = { Slug: 'playhouse-e2e-default' } as PlayhouseEntry;

function drawer() {
  const fixture = TestBed.createComponent(UpdatePlayhouseDrawerComponent);
  fixture.componentInstance.playhouse = playhouse;
  return fixture.componentInstance;
}

describe('Update playhouse drawer', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UpdatePlayhouseDrawerComponent],
      providers: [MessageService],
    }).compileComponents();
  });

  // The command takes NAME without the prefix and adds it back itself, so
  // passing the slug would ask for playhouse-playhouse-e2e-default.
  it('strips the playhouse- prefix for the command', () => {
    expect(drawer().shortName()).toBe('e2e-default');
  });

  // Nothing chosen means "leave it alone", so Apply stays disabled until a
  // setting actually differs.
  it('has no changes until something is set', () => {
    const component = drawer();
    expect(component.hasChanges()).toBe(false);
    component.form.maxPlayroomNodes = 5;
    expect(component.hasChanges()).toBe(true);
  });

  it('hides unknown unchanged comparisons and compares edited settings in one line', () => {
    const component = drawer();
    expect(component.comparisonFor('updateChannel')).toBe('');
    component.form.updateChannel = 'rapid';
    expect(component.comparisonFor('updateChannel')).toBe('Not reported → rapid');
  });

  it.each([
    ['allowCurrentIP', true, 'Add my current public IP'],
    ['allowIPs', ['198.51.100.0/24'], 'Add IP addresses or ranges'],
    ['removeIPs', ['203.0.113.7'], 'Remove IP addresses or ranges'],
    ['resetAllowlist', true, 'Clear the allowlist first'],
    ['waitTimeout', '30m', 'Wait timeout'],
  ] as const)('counts %s in the summary without a comparison', (field, value, label) => {
    const component = drawer();
    Object.assign(component.form, { [field]: value });
    expect(component.changeCount()).toBe(1);
    expect(component.comparisonFor(field)).toBe('');
    expect(component.actionSummary()).toBe(label);
    expect(component.changes().find((change) => change.field === field)).toMatchObject({
      changed: true,
      comparison: false,
    });
  });

  it('sends nothing for an exposure left unchanged', () => {
    expect(drawer().previewInput().Exposure).toBe('');
  });

  // Credentials belong to Tailscale alone; sending them while switching to
  // nodeport would put them on a command that has no use for them.
  // Blank keeps the current default path; auto is how update clears it.
  it('keeps the default connection path unless one is chosen, and can clear it', () => {
    const component = drawer();
    expect(component.previewInput().DefaultVia).toBe('');
    component.form.defaultVia = 'auto';
    expect(component.hasChanges()).toBe(true);
    expect(component.previewInput().DefaultVia).toBe('auto');
  });

  it('only sends Tailscale credentials when switching to Tailscale', () => {
    const component = drawer();
    component.form.tailscaleOAuthClientID = 'id';
    component.form.tailscaleOAuthClientSecret = 'secret';

    component.form.exposure = 'nodeport';
    expect(component.showsTailscaleCredentials()).toBe(false);
    expect(component.previewInput().TailscaleOAuthClientID).toBe('');
    expect(component.previewInput().TailscaleOAuthClientSecret).toBe('');

    component.form.exposure = 'tailscale';
    expect(component.showsTailscaleCredentials()).toBe(true);
    expect(component.previewInput().TailscaleOAuthClientID).toBe('id');
  });

  it('counts every allowlist edit as a change and drops blank rows', () => {
    const component = drawer();
    component.form.allowIPs = ['', ' '];
    expect(component.hasChanges()).toBe(false);

    component.form.removeIPs = [' 203.0.113.7 '];
    expect(component.hasChanges()).toBe(true);
    expect(component.previewInput().RemoveIPs).toEqual(['203.0.113.7']);
    expect(component.previewInput().AllowIPs).toEqual([]);
  });

  // A GUI run has no terminal, so acloud never offers your IP for a switch to NodePort.
  it('switches on your current IP when switching to NodePort', () => {
    const component = drawer();
    component.onExposureChange('nodeport');
    expect(component.previewInput().AllowCurrentIP).toBe(true);
  });

  // A channel switch is a change on its own; blank keeps the current one.
  it('counts an update channel as a change and trims it', () => {
    const component = drawer();
    component.form.updateChannel = '  ';
    expect(component.hasChanges()).toBe(false);
    component.form.updateChannel = ' rapid ';
    expect(component.hasChanges()).toBe(true);
    expect(component.previewInput().UpdateChannel).toBe('rapid');
  });

  // "Bring up to date" is the input-free update an outdated layout asks for:
  // it must not carry whatever was typed into the form first.
  it('emits a bare update to bring the layout up to date', () => {
    const component = drawer();
    component.form.updateChannel = 'rapid';
    component.form.exposure = 'tailscale';
    component.form.maxPlayroomNodes = 9;

    let emitted: { UpdateChannel?: string; Exposure?: string; MaxPlayroomNodes?: number } | null =
      null;
    component.update.subscribe((event) => (emitted = event.input));
    component.submitBringUpToDate();

    expect(emitted).not.toBeNull();
    expect(emitted!.UpdateChannel).toBe('');
    expect(emitted!.Exposure).toBe('');
    expect(emitted!.MaxPlayroomNodes).toBe(0);
  });

  it('emits the slug, not the short name, for job tracking', () => {
    const component = drawer();
    component.form.maxPlayroomNodes = 4;

    let slug = '';
    component.update.subscribe((event) => (slug = event.slug));
    component.submit();

    expect(slug).toBe('playhouse-e2e-default');
  });
});

describe('describeChanges for a playhouse', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UpdatePlayhouseDrawerComponent],
      providers: [MessageService],
    }).compileComponents();
  });

  it('does not infer editable settings from a playhouse listing', () => {
    const component = drawer();
    const changes = describeChanges({ ...playhouse, LayoutVersion: 7 }, component.form);
    expect(changes.every((change) => !change.changed)).toBe(true);
    expect(changes.find((change) => change.field === 'layout')?.current).toBe('7');
    expect(
      changes
        .filter((change) => !['layout', 'waitTimeout'].includes(change.field))
        .every((change) => change.current === null),
    ).toBe(true);
  });

  it.each([
    ['exposure', 'tailscale'],
    ['defaultVia', 'auto'],
    ['updateChannel', 'rapid'],
    ['allowCurrentIP', true],
    ['allowIPs', ['198.51.100.0/24']],
    ['removeIPs', ['203.0.113.7']],
    ['resetAllowlist', true],
    ['maxPlayroomNodes', 5],
    ['maxPrivilegedNodes', 3],
    ['waitTimeout', '30m'],
  ] as const)('describes %s as a proposed change', (field, value) => {
    const component = drawer();
    const changes = describeChanges(playhouse, { ...component.form, [field]: value });
    expect(changes.find((change) => change.field === field)).toMatchObject({
      changed: true,
      needsNewSpec: false,
    });
    expect(changes.filter((change) => change.changed)).toHaveLength(1);
  });

  it.each(['tailscaleOAuthClientID', 'tailscaleOAuthClientSecret'] as const)(
    'never displays %s',
    (field) => {
      const component = drawer();
      Object.assign(component.form, { exposure: 'tailscale', [field]: 'private-value' });
      const changes = describeChanges(playhouse, component.form);
      expect(changes.find((change) => change.field === field)).toMatchObject({
        changed: true,
        proposed: 'Replacement supplied',
      });
      expect(JSON.stringify(changes)).not.toContain('private-value');
      component.form.exposure = 'nodeport';
      expect(
        describeChanges(playhouse, component.form).find((change) => change.field === field)
          ?.changed,
      ).toBe(false);
    },
  );

  it('ignores blank list rows, zero capacity and whitespace, and keeps an unreported layout unknown', () => {
    const component = drawer();
    Object.assign(component.form, { updateChannel: '  ', allowIPs: [' ', ''], removeIPs: [''] });
    expect(describeChanges(playhouse, component.form).every((change) => !change.changed)).toBe(
      true,
    );
    expect(
      describeChanges(playhouse, component.form).find((change) => change.field === 'layout')
        ?.current,
    ).toBeNull();
  });
});

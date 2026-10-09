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

  it('sends nothing for an exposure left unchanged', () => {
    expect(drawer().previewInput().Exposure).toBe('');
  });

  // Credentials belong to Tailscale alone; sending them while switching to
  // nodeport would put them on a command that has no use for them.
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

  // "Upgrade only" is the input-free converge the outdated-layout warning asks
  // for: it must not carry whatever was typed into the form first.
  it('emits a bare converge for an upgrade', () => {
    const component = drawer();
    component.form.exposure = 'tailscale';
    component.form.maxPlayroomNodes = 9;

    let emitted: { Exposure?: string; MaxPlayroomNodes?: number } | null = null;
    component.update.subscribe((event) => (emitted = event.input));
    component.submitUpgradeOnly();

    expect(emitted).not.toBeNull();
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

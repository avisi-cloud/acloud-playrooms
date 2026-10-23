import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { PLAYHOUSE_EXPOSURES } from '../../../../shared/data';
import { CreatePlayhouseDrawerComponent } from './create-playhouse-drawer';

describe('Create playhouse drawer', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreatePlayhouseDrawerComponent],
      providers: [MessageService],
    }).compileComponents();
  });

  it('describes the chosen exposure with the same words as the Edit playhouse drawer', () => {
    const component = TestBed.createComponent(CreatePlayhouseDrawerComponent).componentInstance;
    for (const exposure of PLAYHOUSE_EXPOSURES) {
      component.form.exposure = exposure.id;
      expect(component.selectedExposureHint(), exposure.id).toBe(exposure.hint);
    }
  });

  // --yes skips acloud's own offer, so a NodePort playhouse would otherwise lock you out.
  it('switches on your current IP when NodePort is chosen', () => {
    const component = TestBed.createComponent(CreatePlayhouseDrawerComponent).componentInstance;
    expect(component.form.allowCurrentIP).toBe(false);
    component.onExposureChange('nodeport');
    expect(component.toInput().AllowCurrentIP).toBe(true);
  });

  it('sends the allowlist entries without blank rows', () => {
    const component = TestBed.createComponent(CreatePlayhouseDrawerComponent).componentInstance;
    component.form.allowIPs = [' 198.51.100.0/24 ', ''];
    expect(component.toInput().AllowIPs).toEqual(['198.51.100.0/24']);
    expect(component.allowlistSummary()).toBe('198.51.100.0/24');
  });
});

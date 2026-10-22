import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { CreatePlayroomDrawerComponent } from './create-playroom-drawer';

function drawer() {
  return TestBed.createComponent(CreatePlayroomDrawerComponent).componentInstance;
}

describe('Create playroom drawer', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreatePlayroomDrawerComponent],
      providers: [MessageService, provideRouter([])],
    }).compileComponents();
  });

  // A blank profile leaves --capabilities off. Without an option for it, the
  // select rendered empty and a picked profile could not be undone.
  it('offers the configured default first, and has a hint for every profile', () => {
    const options = drawer().capabilitiesOptions;
    expect(options[0]).toMatchObject({ id: '', label: 'Configured default' });
    expect(options.every((option) => option.hint.length > 0)).toBe(true);
  });

  it('goes from the image error to the Options step with the advanced section open', () => {
    const component = drawer();
    component.form.name = 'demo';
    component.goToPrivilegedModeOnOptionsStep();
    expect(component.stepKey()).toBe('options');
    expect(component.advancedSecurityOpenedFromImageError).toBe(true);
  });

  it('stays on Basics while the name is invalid, so the name error shows first', () => {
    const component = drawer();
    component.form.name = '';
    component.goToPrivilegedModeOnOptionsStep();
    expect(component.stepKey()).toBe('basics');
    expect(component.touched).toBe(true);
  });
});

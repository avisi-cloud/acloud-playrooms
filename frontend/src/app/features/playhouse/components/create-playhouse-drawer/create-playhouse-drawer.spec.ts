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
});

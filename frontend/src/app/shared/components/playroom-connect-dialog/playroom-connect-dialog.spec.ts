import { SimpleChange } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { vi } from 'vitest';
import { PlayroomDefaultsService } from '../../../core/services/playroom-defaults';
import { CONNECTION_PATHS } from '../../data';
import { Playroom } from '../../models';
import { PlayroomConnectDialogComponent } from './playroom-connect-dialog';

const room = { name: 'demo', playhouse: 'playhouse-demo' } as Playroom;

function dialog() {
  const component = TestBed.createComponent(PlayroomConnectDialogComponent).componentInstance;
  component.room = room;
  return component;
}

describe('Playroom connect dialog', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlayroomConnectDialogComponent],
      providers: [MessageService],
    }).compileComponents();
    vi.spyOn(
      TestBed.inject(PlayroomDefaultsService),
      'loadConfiguredDefaultsOnce',
    ).mockResolvedValue();
  });

  afterEach(() => vi.restoreAllMocks());

  // Blank leaves --via off, so acloud reaches the room the way it is exposed.
  it('leaves the connection path to the room by default', () => {
    const component = dialog();
    expect(component.connectInput().Via).toBe('');
    expect(component.openInput().Via).toBe('');
  });

  it('sends the chosen connection path for both connect and open', () => {
    const component = dialog();
    component.via = 'portforward';
    expect(component.connectInput().Via).toBe('portforward');
    expect(component.openInput().Via).toBe('portforward');
  });

  it('starts every opening on the room default again', () => {
    const component = dialog();
    component.via = 'nodeport';
    component.visible = true;
    component.ngOnChanges({ visible: new SimpleChange(false, true, false) });
    expect(component.via).toBe('');
  });

  it('describes every connection path', () => {
    const component = dialog();
    for (const path of CONNECTION_PATHS) {
      component.via = path.id;
      expect(component.selectedConnectionPathHint(), path.id || 'default').toBe(path.hint);
    }
  });
});

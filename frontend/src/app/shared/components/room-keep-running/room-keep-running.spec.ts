import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { RoomKeepRunningComponent } from './room-keep-running';
import { PlayroomStateService } from '../../../core/services/playroom-state';
import { wailsApi } from '../../../core/services/wails-api';
import { listingToRoom } from '../../utils';

describe('room Keep running', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [MessageService] });
    TestBed.inject(PlayroomStateService).setUser('alex@example.test');
  });
  it('loads and saves a local opt-out for an owned room', async () => {
    const save = vi.spyOn(wailsApi, 'setRoomKeepRunning').mockResolvedValue();
    const fixture = TestBed.createComponent(RoomKeepRunningComponent);
    fixture.componentRef.setInput(
      'room',
      listingToRoom({ Name: 'demo', Owner: 'alex@example.test', Status: 'Ready' }, 'ph'),
    );
    await fixture.whenStable();
    const toggle = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '#room-keep-running',
    )!;
    expect(toggle.disabled).toBe(false);
    toggle.click();
    await fixture.whenStable();
    expect(save).toHaveBeenCalledWith('ph', 'demo', true);
    expect(toggle.checked).toBe(true);
  });
  it('does not offer opt-outs for another owner and reports read failures', async () => {
    const fixture = TestBed.createComponent(RoomKeepRunningComponent);
    fixture.componentRef.setInput(
      'room',
      listingToRoom({ Name: 'demo', Owner: 'sam@example.test' }, 'ph'),
    );
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('#room-keep-running')).toBeNull();
    vi.spyOn(wailsApi, 'getRoomKeepRunning').mockRejectedValue(new Error('read failed'));
    fixture.componentRef.setInput(
      'room',
      listingToRoom({ Name: 'demo', Owner: 'alex@example.test' }, 'ph'),
    );
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector<HTMLInputElement>('#room-keep-running')?.disabled).toBe(true);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Could not load');
  });
});

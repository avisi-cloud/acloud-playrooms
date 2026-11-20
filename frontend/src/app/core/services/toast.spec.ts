import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { ToastService } from './toast';

describe('notification delivery and history', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [MessageService] }));
  afterEach(() => vi.restoreAllMocks());

  it('uses five seconds for every tone, failures and custom notifications', () => {
    const add = vi.spyOn(TestBed.inject(MessageService), 'add');
    const notify = TestBed.inject(ToastService);
    for (const tone of ['ok', 'busy', 'warn', 'bad', 'idle'] as const) {
      notify.toast('Notification', tone);
    }
    notify.failure('Could not open editor', new Error('Editor missing'));
    notify.show({ severity: 'warn', detail: 'Custom warning', sticky: true, life: 90000 });

    expect(add).toHaveBeenCalledTimes(7);
    for (const [notification] of add.mock.calls) {
      expect(notification.life).toBe(5000);
      expect(notification.sticky).toBe(false);
    }
  });

  it('keeps newest-first history with full failure details and Activity links', () => {
    const notify = TestBed.inject(ToastService);
    notify.toast('Copied');
    notify.failure('Could not open editor', 'Editor missing; install VS Code', 'open-editor');
    const [failure, copied] = notify.history();

    expect(copied.detail).toBe('Copied');
    expect(failure.summary).toBe('Could not open editor');
    expect(failure.detail).toBe('Editor missing');
    expect(failure.remedy).toBe('Install VS Code');
    expect(failure.operationId).toBe('open-editor');
    expect(failure.createdAt).toBeInstanceOf(Date);
    expect(failure.id).not.toBe(copied.id);
    TestBed.inject(MessageService).clear();
    expect(notify.history()).toHaveLength(2);
  });
});

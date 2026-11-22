import { By } from '@angular/platform-browser';
import { Tooltip } from 'primeng/tooltip';
import { TestBed } from '@angular/core/testing';
import { listingToRoom } from '../../utils';
import { PlayroomRowComponent } from './playroom-row';

const room = listingToRoom(
  {
    Name: 'demo',
    Owner: 'me',
    Status: 'Ready',
    Image: 'ubuntu',
    CPURequest: '1',
    CPULimit: '2',
    MemRequest: '1Gi',
    MemLimit: '2Gi',
    DiskSize: '10Gi',
    Ports: [{ Port: 8080, TargetPort: 3000 }],
    CreatedAt: '2026-01-01T00:00:00Z',
  },
  'playhouse-platform-dev',
);

function createRow() {
  const fixture = TestBed.createComponent(PlayroomRowComponent);
  fixture.componentRef.setInput('room', room);
  fixture.componentRef.setInput('currentUser', 'me');
  fixture.detectChanges();
  return fixture;
}

describe('PlayroomRowComponent', () => {
  afterEach(() => vi.useRealTimers());

  it('renders all eight cells with reported size, age and ports', () => {
    const fixture = createRow();
    const cells = [...fixture.nativeElement.querySelectorAll('td')] as HTMLElement[];
    expect(cells).toHaveLength(8);
    expect(cells.slice(0, 4).map((cell) => cell.textContent?.trim())).toEqual([
      'demo',
      'Ready',
      'you',
      'ubuntu',
    ]);
    expect(cells[4].textContent).toContain('CPU 1 / 2');
    expect(cells[4].textContent).toContain('Memory 1Gi / 2Gi');
    expect(cells[4].textContent).toContain('Disk 10Gi');
    expect(cells[5].textContent).not.toContain('Not reported');
    expect(cells[6].textContent).toContain('8080 → 3000');
    fixture.componentRef.setInput(
      'room',
      listingToRoom({ Name: 'unknown' }, 'playhouse-platform-dev'),
    );
    fixture.detectChanges();
    expect(cells[2].textContent).toContain('Not reported');
    expect(cells[4].textContent).toContain('CPU Not reported');
    expect(cells[5].textContent).toContain('Not reported');
    expect(cells[6].textContent).toContain('Not reported');
    fixture.componentRef.setInput(
      'room',
      listingToRoom({ Name: 'empty', Ports: [] }, 'playhouse-platform-dev'),
    );
    fixture.detectChanges();
    expect(cells[6].textContent).toContain('None');
  });

  it('uses the card owner label and keeps full owner, name and image in keyboard tooltips', () => {
    const fixture = createRow();
    const cells = fixture.nativeElement.querySelectorAll('td');
    expect(cells[2].textContent.trim()).toBe('you');
    expect(
      fixture.debugElement.query(By.css('td:nth-child(3) .truncate')).injector.get(Tooltip).content,
    ).toBe('me');
    expect(fixture.debugElement.query(By.css('.row-name')).injector.get(Tooltip).content).toBe(
      'demo',
    );
    expect(
      fixture.debugElement.query(By.css('td:nth-child(4) .truncate')).injector.get(Tooltip).content,
    ).toBe('ubuntu');
    fixture.componentRef.setInput('room', { ...room, owner: 'other@example.test' });
    fixture.detectChanges();
    expect(cells[2].textContent.trim()).toBe('other');
    expect(
      fixture.debugElement.query(By.css('td:nth-child(3) .truncate')).injector.get(Tooltip).content,
    ).toBe('other@example.test');
    fixture.componentRef.setInput('room', { ...room, ephemeral: true });
    fixture.detectChanges();
    expect(cells[2].textContent.trim()).toBe('you · ephemeral');
  });

  it('opens details by keyboard and single click, and runs the preferred action on double click', async () => {
    vi.useFakeTimers();
    const fixture = createRow();
    const open = vi.fn();
    const preferred = vi.fn();
    fixture.componentInstance.openRoom.subscribe(open);
    fixture.componentInstance.doubleClickRoom.subscribe(preferred);
    const name = fixture.nativeElement.querySelector('.row-name') as HTMLElement;
    name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(open).toHaveBeenCalledExactlyOnceWith('demo');
    open.mockClear();
    name.click();
    await vi.advanceTimersByTimeAsync(500);
    expect(open).toHaveBeenCalledExactlyOnceWith('demo');
    open.mockClear();
    name.click();
    name.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(500);
    expect(preferred).toHaveBeenCalledExactlyOnceWith('demo');
    expect(open).not.toHaveBeenCalled();
  });

  it('selects owned rooms with modifiers and checkbox, and keeps pins and actions separate', async () => {
    vi.useFakeTimers();
    const fixture = createRow();
    const component = fixture.componentInstance;
    const select = vi.fn();
    const open = vi.fn();
    const pin = vi.fn();
    const connect = vi.fn();
    component.selectRoom.subscribe(select);
    component.openRoom.subscribe(open);
    component.pinRoom.subscribe(pin);
    component.connectRoom.subscribe(connect);
    const name = fixture.nativeElement.querySelector('.row-name');
    name.dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: true }));
    expect(select).toHaveBeenLastCalledWith({ name: 'demo', shiftKey: false });
    fixture.componentRef.setInput('selectMode', true);
    fixture.detectChanges();
    const checkbox = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    checkbox.click();
    expect(select).toHaveBeenCalledTimes(2);
    fixture.nativeElement.querySelector('.row-pin').click();
    expect(pin).toHaveBeenCalledExactlyOnceWith('demo');
    fixture.nativeElement.querySelector('button[aria-label="Connect to playroom demo"]').click();
    expect(connect).toHaveBeenCalledExactlyOnceWith('demo');
    await vi.advanceTimersByTimeAsync(500);
    expect(open).not.toHaveBeenCalled();
    fixture.componentRef.setInput('currentUser', 'other');
    fixture.detectChanges();
    expect(checkbox.disabled).toBe(true);
    name.click();
    expect(select).toHaveBeenCalledTimes(2);
  });

  it('uses the same overflow actions as cards and disables actions while pending', () => {
    const fixture = createRow();
    expect(
      fixture.componentInstance
        .menuItems()
        .map((item) => item.label)
        .filter(Boolean),
    ).toEqual(['Open details', 'Copy SSH command', 'Edit', 'Create similar', 'Delete']);
    fixture.componentRef.setInput('pendingOperation', 'Stopping');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain(
      'Stopping',
    );
    expect(
      fixture.nativeElement.querySelector('button[aria-label="More actions for playroom demo"]')
        .disabled,
    ).toBe(true);
    expect(
      fixture.nativeElement.querySelector('button[aria-label="Connect to playroom demo"]'),
    ).toBeNull();
  });
});

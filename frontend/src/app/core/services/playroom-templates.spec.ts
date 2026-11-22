import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { PlayroomTemplatesService } from './playroom-templates';
import { wailsApi } from './wails-api';
import { blankCreateForm } from '../../shared/utils/forms';
import { templateFromCreateForm } from '../../shared/utils/playroom-template';

describe('PlayroomTemplatesService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('saves, renames, exports, imports and deletes through the backend', async () => {
    const template = templateFromCreateForm('Web', blankCreateForm(''));
    vi.spyOn(wailsApi, 'getPlayroomTemplates').mockResolvedValue([]);
    const save = vi.spyOn(wailsApi, 'savePlayroomTemplates').mockResolvedValue();
    const exportTemplate = vi.spyOn(wailsApi, 'exportPlayroomTemplate').mockResolvedValue();
    vi.spyOn(wailsApi, 'importPlayroomTemplates').mockResolvedValue([
      { ...template, name: 'Imported' },
    ]);
    const service = TestBed.inject(PlayroomTemplatesService);
    await service.loadTemplates();
    expect(
      await service.saveTemplate('Web', { ...blankCreateForm(''), env: ['TOKEN=secret'] }),
    ).toBe(true);
    expect(save.mock.calls[0][0][0].options.env).toEqual(['TOKEN']);
    expect(await service.renameTemplate(service.templates()[0], 'Renamed')).toBe(true);
    await service.exportTemplate(service.templates()[0]);
    expect(exportTemplate).toHaveBeenCalledWith(expect.objectContaining({ name: 'Renamed' }));
    expect(await service.importTemplates()).toBe(true);
    expect(service.templates().map((entry) => entry.name)).toEqual(['Renamed', 'Imported']);
    await service.deleteTemplate(service.templates()[0]);
    expect(service.templates().map((entry) => entry.name)).toEqual(['Imported']);
  });

  it('refuses duplicate imports and preserves state on write failure', async () => {
    const template = templateFromCreateForm('Web', blankCreateForm(''));
    vi.spyOn(wailsApi, 'getPlayroomTemplates').mockResolvedValue([template]);
    const save = vi
      .spyOn(wailsApi, 'savePlayroomTemplates')
      .mockRejectedValue(new Error('Disk full'));
    vi.spyOn(wailsApi, 'importPlayroomTemplates').mockResolvedValue([template]);
    const service = TestBed.inject(PlayroomTemplatesService);
    await service.loadTemplates();
    expect(await service.importTemplates()).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(service.error()).toContain('already exists');
    expect(await service.deleteTemplate(template)).toBe(false);
    expect(service.templates()).toEqual([template]);
    expect(service.error()).toContain('Disk full');
  });

  it('does not save when import is cancelled', async () => {
    vi.spyOn(wailsApi, 'getPlayroomTemplates').mockResolvedValue([]);
    vi.spyOn(wailsApi, 'importPlayroomTemplates').mockResolvedValue([]);
    const save = vi.spyOn(wailsApi, 'savePlayroomTemplates').mockResolvedValue();
    const service = TestBed.inject(PlayroomTemplatesService);
    await service.loadTemplates();
    expect(await service.importTemplates()).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it('does not overwrite unreadable storage', async () => {
    vi.spyOn(wailsApi, 'getPlayroomTemplates').mockRejectedValue(new Error('Invalid file'));
    const save = vi.spyOn(wailsApi, 'savePlayroomTemplates').mockResolvedValue();
    const service = TestBed.inject(PlayroomTemplatesService);
    await service.loadTemplates();
    expect(await service.saveTemplate('Web', blankCreateForm(''))).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
});

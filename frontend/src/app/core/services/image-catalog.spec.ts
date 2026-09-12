import { ImageCatalogService } from './image-catalog';
import { wailsApi } from './wails-api';

describe('ImageCatalogService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shares one backend request across concurrent and later callers', async () => {
    const images = [{ Name: 'default', Reference: 'registry/image', IsDefault: true }];
    const list = vi.spyOn(wailsApi, 'listPlayroomImages').mockResolvedValue(images);
    const catalog = new ImageCatalogService();

    const [first, second] = await Promise.all([
      catalog.loadImageCatalogOnce(),
      catalog.loadImageCatalogOnce(),
    ]);
    const third = await catalog.loadImageCatalogOnce();

    expect(first).toEqual(images);
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('allows a retry after a failed request', async () => {
    const list = vi
      .spyOn(wailsApi, 'listPlayroomImages')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([]);
    const catalog = new ImageCatalogService();

    await expect(catalog.loadImageCatalogOnce()).rejects.toThrow('offline');
    await expect(catalog.loadImageCatalogOnce()).resolves.toEqual([]);
    expect(list).toHaveBeenCalledTimes(2);
  });
});

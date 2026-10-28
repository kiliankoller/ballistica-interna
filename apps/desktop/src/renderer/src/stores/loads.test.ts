import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useLoads } from './loads';

const api = {
  libraryList: vi.fn(async () => []),
  masterList: vi.fn(async () => [{ id: 1, label: 'x' }]),
};

describe('component lists', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { api });
    api.libraryList.mockClear();
    api.masterList.mockClear();
    setActivePinia(createPinia());
  });

  it('are loaded once per kind, however often the panels ask (every tab switch mounts them again)', async () => {
    const loads = useLoads();
    await Promise.all([loads.componentLists('projectile'), loads.componentLists('projectile'), loads.componentLists('caliber')]);
    await loads.componentLists('projectile');
    expect(api.masterList).toHaveBeenCalledTimes(2);
    expect(api.libraryList).toHaveBeenCalledTimes(2);
  });

  it('are loaded again after a change of the library', async () => {
    const loads = useLoads();
    await loads.componentLists('propellant');
    loads.dbVersion++;
    await loads.componentLists('propellant');
    expect(api.masterList).toHaveBeenCalledTimes(2);
  });

  it('are asked again after a failed load', async () => {
    const loads = useLoads();
    api.masterList.mockRejectedValueOnce(new Error('ipc'));
    await expect(loads.componentLists('caliber')).rejects.toThrow('ipc');
    await loads.componentLists('caliber');
    expect(api.masterList).toHaveBeenCalledTimes(2);
  });
});

// examples/01-secure-window/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

const invoke = <T = any>(channel: string, payload?: any): Promise<T> => {
  return ipcRenderer.invoke(channel, payload);
};

contextBridge.exposeInMainWorld('api', {
  user: {
    getCurrent: () => invoke('user:getCurrent'),
    update: (patch: Partial<{ name: string; bio: string }>) => invoke('user:update', patch),
  },
  notes: {
    list: (q?: string) => invoke('notes:list', { q }),
    create: (input: { title: string; content: string }) => invoke('notes:create', input),
    update: (id: string, patch: any) => invoke('notes:update', { id, patch }),
    remove: (id: string) => invoke('notes:remove', { id }),
  },
  system: {
    openPath: (target: string) => invoke('system:openPath', { target }),
    showItemInFolder: (target: string) => invoke('system:showItemInFolder', { target }),
  },
  on: (event: string, cb: (payload: any) => void) => {
    const fn = (_: any, payload: any) => cb(payload);
    ipcRenderer.on(event, fn);
    return () => ipcRenderer.off(event, fn);
  },
});

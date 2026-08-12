// apps/desktop/src/preload/index.ts
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  IpcBridge,
  IpcChannel,
  IpcRequest,
  IpcResponse,
  IpcEvent,
  IpcEventPayload,
} from '@core/ipc-contract';

// 单个类型安全的 invoke
async function invoke<C extends IpcChannel>(
  channel: C,
  payload: IpcRequest<C>,
): Promise<IpcResponse<C>> {
  return ipcRenderer.invoke(channel, payload);
}

function on<E extends IpcEvent>(
  event: E,
  cb: (payload: IpcEventPayload<E>) => void,
): () => void {
  const handler = (_e: IpcRendererEvent, p: IpcEventPayload<E>) => cb(p);
  ipcRenderer.on(event, handler);
  return () => ipcRenderer.off(event, handler);
}

// 暴露给渲染进程的 API
const api: IpcBridge = {
  invoke,
  on,
};

contextBridge.exposeInMainWorld('api', api);

// 一些显式声明给业务开发者用，避免他们用 `window.api` 完全 any 化
declare global {
  interface Window {
    api: IpcBridge;
  }
}

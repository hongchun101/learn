// packages/core/src/ipc-contract.ts
// 类型安全 IPC 契约
import type { Note, NoteCreateInput } from './domain/note';
import type { UUID } from './domain/types';

export type IpcChannel =
  | 'notes.list'
  | 'notes.get'
  | 'notes.create'
  | 'notes.update'
  | 'notes.delete';

export interface IpcRequestMap {
  'notes.list': { q?: string; limit?: number; offset?: number };
  'notes.get': { id: UUID };
  'notes.create': NoteCreateInput;
  'notes.update': { id: UUID; patch: Partial<Omit<Note, 'id' | 'createdAt' | 'updatedAt'>> };
  'notes.delete': { id: UUID };
}

export interface IpcResponseMap {
  'notes.list': Note[];
  'notes.get': Note | null;
  'notes.create': UUID;
  'notes.update': Note | null;
  'notes.delete': boolean;
}

export type IpcRequest<C extends IpcChannel> = IpcRequestMap[C];
export type IpcResponse<C extends IpcChannel> = IpcResponseMap[C];

// Stream channel contract
export interface StreamChannel {
  id: string;
  toString(): string;
  on(event: 'message', listener: (msg: { data: unknown }) => void): void;
  postMessage(msg: unknown): void;
  start(): void;
  close(): void;
}

export interface IpcBridge {
  invoke<C extends IpcChannel>(channel: C, payload: IpcRequest<C>): Promise<IpcResponse<C>>;
  // event subscriptions
  on<E extends IpcEvent>(event: E, cb: (payload: IpcEventPayload<E>) => void): () => void;
}

export type IpcEvent = 'app:theme-changed' | 'note:updated' | 'system:update-available';

export interface IpcEventPayloadMap {
  'app:theme-changed': { mode: 'light' | 'dark' };
  'note:updated': { id: string };
  'system:update-available': { version: string };
}

export type IpcEventPayload<E extends IpcEvent> = IpcEventPayloadMap[E];

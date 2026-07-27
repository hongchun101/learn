// 将二元会话类型建模为运行时的协议。

export type Action<R> = { kind: 'send'; msg: R } | { kind: 'recv'; label: string } | { kind: 'close' };

export interface Protocol {
  readonly steps: ReadonlyArray<Action<unknown>>;
}

export const pSend = (msg: unknown): Action<unknown> => ({ kind: 'send', msg });
export const pRecv = (label: string): Action<unknown> => ({ kind: 'recv', label });
export const pClose: Action<unknown> = { kind: 'close' };

export const exec = (steps: ReadonlyArray<Action<unknown>>): ReadonlyArray<Action<unknown>> => steps;

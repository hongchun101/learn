import { describe, it, expect } from 'vitest';
import { exec, pClose, pRecv, pSend } from '../session';

describe('28 session types', () => {
  it('executes a tiny protocol', () => {
    const proto = exec([pSend('hi'), pRecv('reply'), pClose]);
    expect(proto.length).toBe(3);
    expect(proto[1]!.kind).toBe('recv');
  });
});

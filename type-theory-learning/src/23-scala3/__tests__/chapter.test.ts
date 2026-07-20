import { describe, it, expect } from 'vitest';
import { ClientSecret, UserId } from '../opaque';

describe('23 opaque types', () => {
  it('UserId and ClientSecret are nominally distinct at runtime', () => {
    const u = UserId.apply('u-1');
    const c = ClientSecret.apply('s-1');
    expect(typeof UserId.underlying(u)).toBe('string');
    expect(typeof ClientSecret.underlying(c)).toBe('string');
    expect(UserId.underlying(u)).not.toBe(ClientSecret.underlying(c));
  });
});

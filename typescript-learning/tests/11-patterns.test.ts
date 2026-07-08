import {
  Connection,
  expr,
  Emitter,
  execute,
  InMemoryRepository,
  QueryBuilder,
  runSaga,
  saga,
  visit,
  type Expr,
} from '../src/11-patterns/index.js';

interface UserEntity {
  id: string;
  name: string;
}

describe('Module 11: Patterns', () => {
  it('Connection: type-state machine', () => {
    const c = Connection.idle().connect().open('peer-1');
    expect(c.describe()).toBe('open to peer-1');
    const closed = c.close('normal');
    expect(closed.describe()).toContain('closed');
  });

  it('QueryBuilder enforces required fields', () => {
    const missing = QueryBuilder.start().limit(10).build();
    expect(missing.ok).toBe(false);

    const ok = QueryBuilder.start().limit(10).offset(0).build();
    expect(ok.ok).toBe(true);
  });

  it('InMemoryRepository CRUD', async () => {
    const repo = new InMemoryRepository<UserEntity>([{ id: '1', name: 'Ada' }]);
    expect(await repo.findById('1')).toEqual({ id: '1', name: 'Ada' });
    await repo.save({ id: '2', name: 'Linus' });
    expect((await repo.list()).length).toBe(2);
    await repo.delete('1');
    expect(await repo.findById('1')).toBeUndefined();
  });

  it('Emitter is typed by event map', () => {
    type Events = Record<
      'login' | 'logout',
      (u: { id: string }) => void
    >;
    const e = new Emitter<Events>();
    let seen: { id: string } | null = null;
    e.on('login', (u) => {
      seen = u;
    });
    e.emit('login', { id: 'u1' });
    expect(seen).toEqual({ id: 'u1' });
  });

  it('evaluate computes an expression', () => {
    const e: Expr = expr.add(expr.num(1), expr.mul(expr.num(2), expr.num(3)));
    expect(visit(e)).toBe(7);
  });

  it('execute dispatches a command', async () => {
    const r = await execute({ kind: 'createUser', email: 'a@b.co' });
    expect(r).toEqual({ id: 'u_new' });
  });

  it('runSaga advances the generator', async () => {
    const seen: string[] = [];
    const fetchStep = async (url: string): Promise<unknown> => {
      seen.push(url);
      if (url === '/a') return { id: 'x' };
      return { ok: true };
    };
    await runSaga(saga(), fetchStep);
    expect(seen).toEqual(['/a', '/b/x']);
  });
});

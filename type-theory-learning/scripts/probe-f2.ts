import { tlam, lam, v, tapp } from '../src/06-system-f/ast';
import { infer, emptyEnv } from '../src/06-system-f/checker';

const id = tlam('α', lam('x', { kind: 'var' as const, name: 'α' }, v('x')));
const t = infer(emptyEnv, id);
console.log('full:', JSON.stringify(t, null, 2));
const tv = { kind: 'var' as const, name: 'Bool' };
const inst = tapp(id, tv);
const t2 = infer(emptyEnv, inst);
console.log('after tapp:', JSON.stringify(t2, null, 2));

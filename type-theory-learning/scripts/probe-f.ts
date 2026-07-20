import { app, lam, tlam, tapp, v, tru } from '../src/06-system-f/ast';
import { infer, emptyEnv } from '../src/06-system-f/checker';

const id = tlam('α', lam('x', { kind: 'var', name: 'α' }, v('x')));
const t1 = infer(emptyEnv, id);
console.log('id type:', JSON.stringify(t1));

const idAtBool = tapp(id, { kind: 'var', name: 'Bool' });
const t2 = infer(emptyEnv, idAtBool);
console.log('id@Bool type:', JSON.stringify(t2));

const applied = app(idAtBool, tru);
const t3 = infer(emptyEnv, applied);
console.log('id@Bool true type:', JSON.stringify(t3));

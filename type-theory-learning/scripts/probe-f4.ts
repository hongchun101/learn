import { app, lam, tlam, tapp, v, tru, tv } from '../src/06-system-f/ast';
import { infer, emptyEnv } from '../src/06-system-f/checker';

// 与测试用例相同的构建方式
const id = tlam('α', lam('x', tv('α'), v('x')));
const t1 = infer(emptyEnv, id);
console.log('id type:', JSON.stringify(t1));
const specialised = tapp(id, tv('Bool'));
console.log('specialised kind:', JSON.stringify((specialised as any).kind));
const t2 = infer(emptyEnv, specialised);
console.log('id@Bool type:', JSON.stringify(t2));

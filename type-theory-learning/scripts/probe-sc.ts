import { decidesTermination, type Fun } from '../src/05-inductive/sizechange';

const f: Fun = { name: 'len', param: 'xs', body: { kind: 'apply', fn: 'len', arg: { name: 'xs' } } };
console.log('result:', decidesTermination([f]));

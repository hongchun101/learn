import type { Term } from '../src/01-untyped-lambda/ast';
import { v } from '../src/01-untyped-lambda/ast';

const t: Term = v('x');
console.log(t.kind, t.kind === 'var' && t.name);

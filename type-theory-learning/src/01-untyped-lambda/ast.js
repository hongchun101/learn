"use strict";
// AST of the untyped lambda calculus (Chapter 01).
//
//   t ::= x | λx. t | t t
//
// `Term` is a small algebraic data type. Higher chapters (02 STLC, 06 System F,
// 11 Pi-types) extend this with type annotations and binders; the constructor
// names are deliberately stable.
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = exports.lam = exports.v = void 0;
exports.pretty = pretty;
exports.equal = equal;
var v = function (name) { return ({ kind: 'var', name: name }); };
exports.v = v;
var lam = function (param, body) { return ({ kind: 'lam', param: param, body: body }); };
exports.lam = lam;
var app = function (func, arg) { return ({ kind: 'app', func: func, arg: arg }); };
exports.app = app;
/** `pretty t` renders a `Term` back to a readable lambda term. */
function pretty(t) {
    switch (t.kind) {
        case 'var':
            return t.name;
        case 'lam': {
            var body = pretty(t.body);
            // Drop body parens when it's a var or another abstraction.
            var wrap = t.body.kind === 'app' || t.body.kind === 'lam';
            return "\u03BB".concat(t.param, ".").concat(wrap ? body : body);
        }
        case 'app': {
            var f = t.func.kind === 'lam' ? "(".concat(pretty(t.func), ")") : pretty(t.func);
            var a = t.arg.kind === 'app' ? "(".concat(pretty(t.arg), ")") : pretty(t.arg);
            return "".concat(f, " ").concat(a);
        }
    }
}
/** Structural equality. */
function equal(a, b) {
    if (a.kind !== b.kind)
        return false;
    switch (a.kind) {
        case 'var':
            return a.name === b.name;
        case 'lam':
            return a.param === b.param && equal(a.body, b.body);
        case 'app':
            return equal(a.func, b.func) && equal(a.arg, b.arg);
    }
}

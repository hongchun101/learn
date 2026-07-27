"use strict";
// 无类型 lambda 演算（第 01 章）的 AST。
//
//   t ::= x | λx. t | t t
//
// `Term` 是一个小型代数数据类型。后续章节（02 STLC、06 System F、
// 11 Pi-类型）会通过类型注解与绑定器对其进行扩展；构造子
// 的名称刻意保持稳定。
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
/** `pretty t` 将 `Term` 渲染回可读的 lambda 项。 */
function pretty(t) {
    switch (t.kind) {
        case 'var':
            return t.name;
        case 'lam': {
            var body = pretty(t.body);
            // 当 body 是变量或另一个抽象时，省略其括号。
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
/** 结构相等性。 */
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

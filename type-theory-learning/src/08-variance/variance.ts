// 变型性示例。
//
// 类型构造子 `F` 称为：
//   - 协变    若  Sub(τ, σ)  蕴含  Sub(F<τ>, F<σ>)
//   - 逆变    若  Sub(τ, σ)  蕴含  Sub(F<σ>, F<τ>)
//   - 不变    若 上述两个方向都成立
// 函数在参数上是逆变、在返回值上是协变。

export type Var = string;
export type Type = { kind: 'var'; name: Var } | { kind: 'fun'; param: Type; body: Type };

export type SubKind = 'covariant' | 'contravariant' | 'invariant' | 'phantom';

export interface FunInfo {
  paramVar: SubKind;
  bodyVar: SubKind;
}

/** `variance(op, type)` 相对于所选类型位置遍历一个类型。 */
export function varianceAtPosition(op: 'funParam' | 'funBody', τ: Type): SubKind {
  if (τ.kind === 'var') return 'covariant';
  if (op === 'funParam') {
    // funParam 处于逆变位置，因为它产出输入。
    const bodyV = varianceAtPosition('funBody', τ.body);
    return bodyV; // 参数位置本身对所看到的内容是逆变的
  }
  return varianceAtPosition('funParam', τ.param);
}

/** 幻影类型：在项层完全看不到的类型变量。 */
export interface Box<T, Phantom extends string = 'none'> {
  value: T;
  readonly __phantom?: Phantom;
}

export const box = <T>(v: T): Box<T> => ({ value: v });

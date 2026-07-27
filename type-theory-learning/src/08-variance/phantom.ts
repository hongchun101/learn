// 幻影类型示例：类型层级的标签。

export type Units = 'm' | 'cm';

export interface Length<Unit extends Units> {
  readonly value: number;
  readonly __unit?: Unit;
}

export const m = (value: number): Length<'m'> => ({ value });
export const cm = (value: number): Length<'cm'> => ({ value });

export const addM = (a: Length<'m'>, b: Length<'m'>): Length<'m'> => ({ value: a.value + b.value });
export const addCm = (a: Length<'cm'>, b: Length<'cm'>): Length<'cm'> => ({ value: a.value + b.value });

/** 带有幻影标记的恒等函数：运行时不会带来额外数据。 */
export const id = <T>(x: T): T => x;

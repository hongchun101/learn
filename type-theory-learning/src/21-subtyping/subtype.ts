// 子类型 —— 结构子类型与名义子类型。

export interface Shape {
  readonly name: string;
  readonly area: () => number;
}

export const circle = (r: number): Shape => ({ name: 'circle', area: () => Math.PI * r * r });
export const square = (s: number): Shape => ({ name: 'square', area: () => s * s });

// 结构子类型：任何包含 `name: string` 与 `area(): number` 的对象都是 Shape。
export const isShape = (x: unknown): x is Shape =>
  !!x && typeof x === 'object' && 'name' in x && typeof (x as { area?: unknown }).area === 'function';

// 名义子类型：要求 `name` 中携带判别字符串。
export const isCircle = (s: Shape): boolean => s.name === 'circle';

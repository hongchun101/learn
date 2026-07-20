// Subtyping — structural and nominal styles.

export interface Shape {
  readonly name: string;
  readonly area: () => number;
}

export const circle = (r: number): Shape => ({ name: 'circle', area: () => Math.PI * r * r });
export const square = (s: number): Shape => ({ name: 'square', area: () => s * s });

// Structural: any object with `name: string` and `area(): number` is a Shape.
export const isShape = (x: unknown): x is Shape =>
  !!x && typeof x === 'object' && 'name' in x && typeof (x as { area?: unknown }).area === 'function';

// Nominal: require a discriminator string in `name`.
export const isCircle = (s: Shape): boolean => s.name === 'circle';

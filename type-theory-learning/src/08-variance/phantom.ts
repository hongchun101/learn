// Phantom types demo: type-level tags.

export type Units = 'm' | 'cm';

export interface Length<Unit extends Units> {
  readonly value: number;
  readonly __unit?: Unit;
}

export const m = (value: number): Length<'m'> => ({ value });
export const cm = (value: number): Length<'cm'> => ({ value });

export const addM = (a: Length<'m'>, b: Length<'m'>): Length<'m'> => ({ value: a.value + b.value });
export const addCm = (a: Length<'cm'>, b: Length<'cm'>): Length<'cm'> => ({ value: a.value + b.value });

/** Phantom-marked identity: at runtime, no extra data. */
export const id = <T>(x: T): T => x;

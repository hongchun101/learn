// Linear-usage analyzer at the value level.
//
//   linear : exactly 1 use
//   affine : exactly 0 or 1 use
//   relevant : any number of uses ≥ 1
//
// We track usage counts with a Map<name, count>.

export type Mode = 'linear' | 'affine' | 'relevant';

export interface UseState {
  readonly uses: Map<string, number>;
}

export const emptyUses: UseState = { uses: new Map() };

export function use(st: UseState, name: string, mode: Mode): UseState {
  const next = new Map(st.uses);
  const cur = next.get(name) ?? 0;
  next.set(name, cur + 1);
  if (mode === 'linear' && cur + 1 > 1) throw new Error(`linear ${name} used twice`);
  if (mode === 'affine' && cur + 1 > 1) throw new Error(`affine ${name} used twice`);
  return { uses: next };
}

/** `unusedOk` — is the variable allowed to be unused at this count?
 *  - linear:    must be exactly 1 use → unused OK iff count === 1?  No. "Is 0 still
 *                 acceptable?" → false for linear. Reinterpret: returns true when
 *                 the *use count meets* the mode (so we are free to drop further
 *                 checks at the end).
 */
export function unusedOk(mode: Mode, count: number): boolean {
  if (mode === 'linear') return count >= 1;
  if (mode === 'affine') return count <= 1;
  return count >= 1;
}

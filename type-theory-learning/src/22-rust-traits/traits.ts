// Modeling Rust trait-object vtables + coherence rules at the value level.

export interface TraitMeta {
  readonly name: string;
  readonly methods: ReadonlyArray<string>;
}

export const IteratorTrait: TraitMeta = {
  name: 'Iterator',
  methods: ['next', 'size_hint'],
};

export const EqTrait: TraitMeta = { name: 'Eq', methods: ['eq'] };

/** A vtable for a trait instance. */
export interface VTable<T extends TraitMeta> {
  readonly trait: T;
  readonly impls: Readonly<Record<string, unknown>>;
  readonly target: unknown;
}

export const vtable = <T extends TraitMeta>(trait: T, target: unknown, impls: Record<string, unknown>): VTable<T> =>
  ({ trait, impls, target });

/** Coherence: no two `impl` blocks for the same (Trait, Type) tuple in the same crate. */
export function coherent(impl1: VTable<TraitMeta>, impl2: VTable<TraitMeta>): boolean {
  if (impl1.trait.name !== impl2.trait.name) return true;
  return impl1.target !== impl2.target;
}

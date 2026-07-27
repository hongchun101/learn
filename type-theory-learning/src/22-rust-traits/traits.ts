// 在值层面建模 Rust 的 trait 对象 vtable 与一致性规则。

export interface TraitMeta {
  readonly name: string;
  readonly methods: ReadonlyArray<string>;
}

export const IteratorTrait: TraitMeta = {
  name: 'Iterator',
  methods: ['next', 'size_hint'],
};

export const EqTrait: TraitMeta = { name: 'Eq', methods: ['eq'] };

/** 一个 trait 实例的 vtable。 */
export interface VTable<T extends TraitMeta> {
  readonly trait: T;
  readonly impls: Readonly<Record<string, unknown>>;
  readonly target: unknown;
}

export const vtable = <T extends TraitMeta>(trait: T, target: unknown, impls: Record<string, unknown>): VTable<T> =>
  ({ trait, impls, target });

/** 一致性：在同一个 crate 中，对相同 (Trait, Type) 对不能出现两个 `impl`。 */
export function coherent(impl1: VTable<TraitMeta>, impl2: VTable<TraitMeta>): boolean {
  if (impl1.trait.name !== impl2.trait.name) return true;
  return impl1.target !== impl2.target;
}

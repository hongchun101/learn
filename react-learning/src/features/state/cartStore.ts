/**
 * Cart store — a Zustand store with a slice-and-selector pattern.
 *
 * Zustand's key idea: a single hook, `useCartStore(selector)`, that
 * subscribes only to the slice you read. The selector is also where you
 * decide what counts as "changed" (via the optional second argument,
 * `equalityFn`).
 *
 * Persistence: a `persist` middleware writes the store to localStorage on
 * every change. The `partialize` option keeps transient UI state out of
 * the serialised blob.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface CartItem {
  id: number;
  name: string;
  qty: number;
}

interface CartState {
  items: CartItem[];
  add: (item: Omit<CartItem, 'qty'>) => void;
  remove: (id: number) => void;
  setQty: (id: number, qty: number) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      add: (item) =>
        set((state) => {
          const existing = state.items.find((x) => x.id === item.id);
          if (existing) {
            return {
              items: state.items.map((x) =>
                x.id === item.id ? { ...x, qty: x.qty + 1 } : x,
              ),
            };
          }
          return { items: [...state.items, { ...item, qty: 1 }] };
        }),
      remove: (id) => set((state) => ({ items: state.items.filter((x) => x.id !== id) })),
      setQty: (id, qty) =>
        set((state) => ({
          items: state.items.map((x) => (x.id === id ? { ...x, qty } : x)),
        })),
      clear: () => set({ items: [] }),
    }),
    {
      name: 'rl.cart',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

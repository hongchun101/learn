import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useCartStore, useTodoStore } from '@stores/cart';

describe('stores/cart', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('cart adds and totals', () => {
    const cart = useCartStore();
    cart.add({ id: 1, name: 'A', price: 10 });
    cart.add({ id: 2, name: 'B', price: 20 });
    expect(cart.count).toBe(2);
    expect(cart.total).toBe(30);
  });

  it('todo toggles and remaining updates', () => {
    const todo = useTodoStore();
    const beforeTotal = todo.items.length;
    const beforeDone = todo.items.filter((t) => t.done).length;
    const beforeRemaining = beforeTotal - beforeDone;
    expect(todo.remaining).toBe(beforeRemaining);
    todo.add('New task');
    expect(todo.remaining).toBe(beforeRemaining + 1);

    // Capture the value before mutation (proxies are mutable)
    const initialDone = todo.items[0]?.done;
    const targetId = todo.items[0]?.id;
    if (targetId === undefined) throw new Error('no item');

    todo.toggle(targetId);
    expect(todo.items[0]?.done).toBe(!initialDone);
    todo.clearCompleted();
    expect(todo.items.every((t) => !t.done)).toBe(true);
  });
});

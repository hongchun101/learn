import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useCartStore } from './cartStore';

const reset = () => useCartStore.setState({ items: [] });

describe('cartStore', () => {
  beforeEach(reset);
  afterEach(reset);

  it('adds a new item', () => {
    useCartStore.getState().add({ id: 1, name: 'Apples' });
    expect(useCartStore.getState().items).toEqual([{ id: 1, name: 'Apples', qty: 1 }]);
  });

  it('increments qty for an existing item', () => {
    useCartStore.getState().add({ id: 1, name: 'Apples' });
    useCartStore.getState().add({ id: 1, name: 'Apples' });
    expect(useCartStore.getState().items).toEqual([{ id: 1, name: 'Apples', qty: 2 }]);
  });

  it('removes an item', () => {
    useCartStore.getState().add({ id: 1, name: 'Apples' });
    useCartStore.getState().remove(1);
    expect(useCartStore.getState().items).toEqual([]);
  });
});

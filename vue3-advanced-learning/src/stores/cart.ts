import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export interface CartItem {
  id: number;
  name: string;
  price: number;
}

export interface TodoItem {
  id: number;
  text: string;
  done: boolean;
}

export const useTodoStore = defineStore('todo', () => {
  const items = ref<TodoItem[]>([
    { id: 1, text: '学习响应式 API', done: true },
    { id: 2, text: '编写 composables', done: false },
  ]);
  const filter = ref<'all' | 'active' | 'completed'>('all');

  const remaining = computed(() => items.value.filter((t) => !t.done).length);

  function add(text: string): void {
    items.value.push({ id: Date.now() + Math.random(), text, done: false });
  }
  function toggle(id: number): void {
    const t = items.value.find((x) => x.id === id);
    if (t) t.done = !t.done;
  }
  function clearCompleted(): void {
    items.value = items.value.filter((t) => !t.done);
  }
  function setFilter(f: 'all' | 'active' | 'completed'): void {
    filter.value = f;
  }

  return { items, filter, remaining, add, toggle, clearCompleted, setFilter };
});

export const useCartStore = defineStore('cart', () => {
  const items = ref<CartItem[]>([]);
  const total = computed(() => items.value.reduce((s, i) => s + i.price, 0));
  const count = computed(() => items.value.length);

  function add(item: CartItem): void {
    items.value.push(item);
  }
  function remove(id: number): void {
    const idx = items.value.findIndex((i) => i.id === id);
    if (idx >= 0) items.value.splice(idx, 1);
  }
  function clear(): void {
    items.value = [];
  }

  return { items, total, count, add, remove, clear };
});

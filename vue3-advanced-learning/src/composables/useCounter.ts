import { computed, ref, type ComputedRef, type Ref } from 'vue';

export interface UseCounterOptions {
  min?: number;
  max?: number;
}

export interface UseCounterReturn {
  count: Ref<number>;
  inc: (delta?: number) => void;
  dec: (delta?: number) => void;
  set: (value: number) => void;
  reset: () => void;
  isAtMin: ComputedRef<boolean>;
  isAtMax: ComputedRef<boolean>;
}

/**
 * Bounded counter with delta operations.
 */
export function useCounter(
  initial = 0,
  options: UseCounterOptions = {}
): UseCounterReturn {
  const { min = -Infinity, max = Infinity } = options;
  const initialSnapshot = initial;
  const count = ref(initial) as Ref<number>;

  function clamp(v: number): number {
    return Math.min(max, Math.max(min, v));
  }

  function inc(delta = 1): void {
    count.value = clamp(count.value + delta);
  }
  function dec(delta = 1): void {
    count.value = clamp(count.value - delta);
  }
  function set(v: number): void {
    count.value = clamp(v);
  }
  function reset(): void {
    count.value = initialSnapshot;
  }

  return {
    count,
    inc,
    dec,
    set,
    reset,
    isAtMin: computed(() => count.value <= min),
    isAtMax: computed(() => count.value >= max),
  };
}

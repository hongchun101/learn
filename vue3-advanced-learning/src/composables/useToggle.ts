import { ref, type Ref } from 'vue';

export interface UseToggleReturn {
  value: Ref<boolean>;
  toggle: (value?: boolean) => boolean;
  setTrue: () => void;
  setFalse: () => void;
}

/**
 * Boolean toggle with imperative control.
 */
export function useToggle(initial = false): UseToggleReturn {
  const value = ref(initial) as Ref<boolean>;
  function toggle(next?: boolean): boolean {
    if (typeof next === 'boolean') value.value = next;
    else value.value = !value.value;
    return value.value;
  }
  return {
    value,
    toggle,
    setTrue: () => {
      value.value = true;
    },
    setFalse: () => {
      value.value = false;
    },
  };
}

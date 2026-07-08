import { describe, expect, it } from 'vitest';
import { effectScope } from 'vue';
import { useToggle } from '@composables/useToggle';

describe('useToggle', () => {
  it('toggles between true and false', () => {
    const scope = effectScope();
    scope.run(() => {
      const t = useToggle(false);
      expect(t.value.value).toBe(false);
      const next = t.toggle();
      expect(next).toBe(true);
      expect(t.value.value).toBe(true);
      t.setFalse();
      expect(t.value.value).toBe(false);
    });
    scope.stop();
  });

  it('toggle with explicit value sets that value', () => {
    const scope = effectScope();
    scope.run(() => {
      const t = useToggle();
      t.toggle(false);
      expect(t.value.value).toBe(false);
      t.toggle(true);
      expect(t.value.value).toBe(true);
    });
    scope.stop();
  });
});

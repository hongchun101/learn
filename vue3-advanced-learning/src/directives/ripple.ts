import type { Directive } from 'vue';

interface RippleOptions {
  color?: string;
  /** Disable on touch devices. */
  disabled?: boolean;
}

const styles = `
.v-ripple {
  position: relative;
  overflow: hidden;
}
.v-ripple__ink {
  position: absolute;
  border-radius: 50%;
  transform: scale(0);
  background: currentColor;
  opacity: 0.4;
  animation: v-ripple-expand 600ms ease-out;
  pointer-events: none;
}
@keyframes v-ripple-expand {
  to {
    transform: scale(2.5);
    opacity: 0;
  }
}
`;

if (typeof document !== 'undefined' && !document.getElementById('v-ripple-styles')) {
  const tag = document.createElement('style');
  tag.id = 'v-ripple-styles';
  tag.textContent = styles;
  document.head.appendChild(tag);
}

export const ripple: Directive<HTMLElement, RippleOptions | undefined> = {
  mounted(el, binding) {
    el.classList.add('v-ripple');
    el.addEventListener('pointerdown', (e) => {
      if (binding.value?.disabled) return;
      const rect = el.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const ink = document.createElement('span');
      ink.className = 'v-ripple__ink';
      ink.style.width = `${size}px`;
      ink.style.height = `${size}px`;
      ink.style.left = `${e.clientX - rect.left - size / 2}px`;
      ink.style.top = `${e.clientY - rect.top - size / 2}px`;
      if (binding.value?.color) ink.style.background = binding.value.color;
      el.appendChild(ink);
      ink.addEventListener('animationend', () => ink.remove(), { once: true });
    });
  },
};

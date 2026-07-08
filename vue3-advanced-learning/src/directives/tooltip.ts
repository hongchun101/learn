import type { Directive, DirectiveBinding } from 'vue';

interface TooltipBinding {
  text: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

let activeTooltip: HTMLElement | null = null;

function show(el: HTMLElement, binding: DirectiveBinding<TooltipBinding>): void {
  hide();
  const { text, placement = 'top' } = binding.value ?? { text: '' };
  if (!text) return;
  const tip = document.createElement('div');
  tip.className = `v-tooltip v-tooltip--${placement}`;
  tip.textContent = text;
  Object.assign(tip.style, {
    position: 'fixed',
    background: 'rgba(20,20,20,0.92)',
    color: '#fff',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    zIndex: '9999',
    pointerEvents: 'none',
    transition: 'opacity .15s',
    opacity: '0',
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(tip);
  activeTooltip = tip;
  position(tip, el, placement);
  requestAnimationFrame(() => {
    tip.style.opacity = '1';
  });
}

function position(tip: HTMLElement, host: HTMLElement, placement: 'top' | 'bottom' | 'left' | 'right'): void {
  const r = host.getBoundingClientRect();
  const tr = tip.getBoundingClientRect();
  const margin = 8;
  let x = 0;
  let y = 0;
  switch (placement) {
    case 'top':
      x = r.left + r.width / 2 - tr.width / 2;
      y = r.top - tr.height - margin;
      break;
    case 'bottom':
      x = r.left + r.width / 2 - tr.width / 2;
      y = r.bottom + margin;
      break;
    case 'left':
      x = r.left - tr.width - margin;
      y = r.top + r.height / 2 - tr.height / 2;
      break;
    case 'right':
      x = r.right + margin;
      y = r.top + r.height / 2 - tr.height / 2;
      break;
  }
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}

function hide(): void {
  if (activeTooltip) {
    activeTooltip.remove();
    activeTooltip = null;
  }
}

export const tooltip: Directive<HTMLElement, TooltipBinding> = {
  mounted(el, binding) {
    el.addEventListener('mouseenter', () => show(el, binding));
    el.addEventListener('mouseleave', hide);
    el.addEventListener('click', hide);
  },
  updated(el, binding) {
    if (binding.value?.text !== binding.oldValue?.text) {
      hide();
    }
  },
  unmounted() {
    hide();
  },
};

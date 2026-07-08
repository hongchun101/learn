/**
 * Tooltip — accessible, portal-rendered tooltip.
 *
 * Implementation notes:
 *  - The floating panel is rendered into `document.body` via
 *    `createPortal`. That way the parent's `overflow: hidden` and stacking
 *    context can't clip it.
 *  - Position is recomputed on scroll and resize, using the trigger's
 *    `getBoundingClientRect()`.
 *  - `role="tooltip"` + `aria-describedby` is the canonical a11y wiring.
 *  - Pointer + focus both open the tooltip; pointerleave + blur both close
 *    it. Keyboard users can read the content too.
 */
import { cloneElement, useEffect, useId, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { useEvent } from '@core/hooks';

export interface TooltipProps {
  label: React.ReactNode;
  // We accept any single focusable child and clone it with extra props.
  // The public contract is documented in the JSDoc; the consumer passes a
  // focusable element (button, anchor, etc.).
  children: ReactElement<Record<string, unknown>>;
}

type Position = { top: number; left: number };

function place(rect: DOMRect, tooltip: HTMLElement, gap = 6): Position {
  const tt = tooltip.getBoundingClientRect();
  return {
    top: rect.bottom + gap,
    left: Math.max(4, rect.left + rect.width / 2 - tt.width / 2),
  };
}

export function Tooltip({ label, children }: TooltipProps) {
  const id = useId();
  const triggerRef = useRef<HTMLElement | null>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Position>({ top: 0, left: 0 });
  const onOpen = useEvent(() => setOpen(true));
  const onClose = useEvent(() => setOpen(false));

  useEffect(() => {
    if (!open) return;
    const measure = () => {
      if (!triggerRef.current || !tipRef.current) return;
      setPos(place(triggerRef.current.getBoundingClientRect(), tipRef.current));
    };
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open, label]);

  return (
    <>
      {cloneElement(children, {
        ref: (node: HTMLElement | null) => {
          triggerRef.current = node;
        },
        'aria-describedby': open ? id : undefined,
        onPointerEnter: () => onOpen(),
        onPointerLeave: () => onClose(),
        onFocus: () => onOpen(),
        onBlur: () => onClose(),
      })}
      {open && typeof document !== 'undefined'
        ? createPortal(
            <span
              ref={tipRef}
              role="tooltip"
              id={id}
              style={{
                position: 'fixed',
                top: pos.top,
                left: pos.left,
                background: 'var(--color-bg-elev-2)',
                color: 'var(--color-fg)',
                padding: '4px 8px',
                borderRadius: 4,
                fontSize: 12,
                zIndex: 1100,
                pointerEvents: 'none',
              }}
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}

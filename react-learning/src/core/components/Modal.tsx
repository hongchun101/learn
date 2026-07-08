/**
 * Modal — accessible dialog.
 *
 * Patterns:
 *  - `createPortal` mounts the dialog under `document.body`, so the parent's
 *    `overflow: hidden` and `z-index` don't trap it.
 *  - Focus is moved to the first focusable element on open and restored to
 *    the previously-focused element on close.
 *  - Tab / Shift+Tab cycle inside the dialog — a "focus trap".
 *  - `Escape` closes the dialog.
 *  - `aria-modal`, `role="dialog"`, `aria-labelledby` for screen readers.
 *  - Body scroll is locked while open.
 */
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useEvent } from '@core/hooks';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  /** Optional callback when the user clicks the backdrop. */
  onBackdropClick?: () => void;
}

export function Modal({ open, onClose, title, children, onBackdropClick }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const onCloseStable = useEvent(onClose);

  useEffect(() => {
    if (!open) return;
    restoreFocus.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';

    const dialog = dialogRef.current;
    if (dialog) {
      const first = dialog.querySelectorAll<HTMLElement>(FOCUSABLE)[0];
      first?.focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseStable();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      restoreFocus.current?.focus();
    };
  }, [open, onCloseStable]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onBackdropClick?.();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 1000,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          background: 'var(--color-bg-elev)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 20,
          minWidth: 320,
          maxWidth: 540,
        }}
      >
        <h2 id={titleId} style={{ marginTop: 0 }}>
          {title}
        </h2>
        {children}
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose}>close (esc)</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

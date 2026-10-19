'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** Popup form. Wrap fields as children; Enter submits, Esc or the backdrop closes. */
export default function Modal({ open, title, subtitle, onClose, onSubmit, submitLabel = 'Save', busy = false, error, size = 'md', children }: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  onSubmit?: () => void | Promise<void>;
  submitLabel?: string;
  busy?: boolean;
  error?: string;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}) {
  const titleId = useId();
  const panel = useRef<HTMLFormElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busyRef.current) closeRef.current(); };
    document.addEventListener('keydown', onKey);
    const lock = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => {
      const first = panel.current?.querySelector<HTMLElement>('input:not([type=hidden]):not([disabled]), select, textarea');
      (first ?? panel.current)?.focus();
    }, 30);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = lock;
      previous?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!busy) void onSubmit?.();
  }

  return createPortal(
    <div className="modalBackdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <form className={'modal ' + size} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panel} tabIndex={-1} onSubmit={submit} noValidate>
        <header className="modalHead">
          <div><h2 id={titleId}>{title}</h2>{subtitle && <p className="hint">{subtitle}</p>}</div>
          <button type="button" className="iconBtn" aria-label="Close" onClick={onClose} disabled={busy}><X size={18} /></button>
        </header>
        <div className="modalBody">
          {children}
          {error && <div className="error" role="alert">{error}</div>}
        </div>
        <footer className="modalFoot">
          <button type="button" className="secondary" onClick={onClose} disabled={busy}>Cancel</button>
          {onSubmit && <button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>}
        </footer>
      </form>
    </div>,
    document.body,
  );
}

/** Labelled field used inside popups and the setup wizard. */
export function Field({ label, hint, children, wide = false }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return <label className={'mField' + (wide ? ' wide' : '')}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

/** Short confirmation message that clears itself. Render `toast` once in the screen. */
export function useToast() {
  const [message, show] = useState('');
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(() => show(''), 3500);
    return () => window.clearTimeout(t);
  }, [message]);
  return { show, toast: message ? <div className="snack" role="status">{message}</div> : null };
}

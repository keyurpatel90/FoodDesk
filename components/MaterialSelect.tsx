'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import './material-select.css';

export type MaterialSelectOption<T extends string> = { value: T; label: string; disabled?: boolean };

type Props<T extends string> = {
  value: T;
  options: MaterialSelectOption<T>[];
  onChange: (value: T) => void;
  /** Accessible name, e.g. "Role for Ravi". Always required (screen readers). */
  ariaLabel: string;
  /** Optional small floating label inside the field (outlined Material text-field style). */
  label?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
};

type Placement = { left: number; minWidth: number; maxHeight: number; above: boolean; top?: number; bottom?: number };

/**
 * Material-style dropdown: outlined field, elevated menu, check mark on the selected option.
 * The menu is rendered in a portal with fixed positioning so it is never clipped by tables or modals, and it
 * flips upward near the bottom of the screen. Fully keyboard accessible (arrows, Home/End, Enter/Space, Esc, type-ahead).
 */
export default function MaterialSelect<T extends string>({ value, options, onChange, ariaLabel, label, disabled, size = 'sm', className }: Props<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: '', timer: 0 });
  const uid = useId();
  const listId = `${uid}-list`;

  const selectedIndex = options.findIndex(o => o.value === value);
  const selected = options[selectedIndex];
  const enabled = (i: number) => i >= 0 && i < options.length && !options[i].disabled;

  const place = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    const wanted = Math.min(options.length * 42 + 12, 320);
    const flip = below < Math.min(wanted, 200) && above > below;
    const maxHeight = Math.max(120, Math.min(320, flip ? above : below));
    setPlacement(flip
      ? { left: r.left, minWidth: r.width, maxHeight, above: true, bottom: window.innerHeight - r.top + 4 }
      : { left: r.left, minWidth: r.width, maxHeight, above: false, top: r.bottom + 4 });
  }, [options.length]);

  const move = (from: number, step: 1 | -1) => {
    for (let i = from + step; i >= 0 && i < options.length; i += step) if (enabled(i)) return i;
    return from;
  };
  const firstEnabled = () => options.findIndex((_, i) => enabled(i));
  const lastEnabled = () => { for (let i = options.length - 1; i >= 0; i--) if (enabled(i)) return i; return -1; };

  const openMenu = () => {
    if (disabled) return;
    place();
    setActive(enabled(selectedIndex) ? selectedIndex : firstEnabled());
    setOpen(true);
  };
  const close = () => setOpen(false);
  const choose = (i: number) => {
    if (!enabled(i)) return;
    if (options[i].value !== value) onChange(options[i].value);
    close();
    buttonRef.current?.focus();
  };

  // While open: close on outside click, keep the menu attached to the button on scroll / resize.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: Event) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const { key } = e;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(key)) { e.preventDefault(); openMenu(); }
      return;
    }
    if (key === 'ArrowDown') { e.preventDefault(); setActive(a => move(a, 1)); }
    else if (key === 'ArrowUp') { e.preventDefault(); setActive(a => move(a, -1)); }
    else if (key === 'Home') { e.preventDefault(); setActive(firstEnabled()); }
    else if (key === 'End') { e.preventDefault(); setActive(lastEnabled()); }
    else if (key === 'Enter' || key === ' ') { e.preventDefault(); choose(active); }
    else if (key === 'Escape') { e.preventDefault(); close(); }
    else if (key === 'Tab') { close(); }
    else if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      window.clearTimeout(typed.current.timer);
      typed.current.text += key.toLowerCase();
      typed.current.timer = window.setTimeout(() => { typed.current.text = ''; }, 600);
      const from = typed.current.text.length > 1 ? active : active + 1;
      const order = [...options.keys()].map(i => (i + Math.max(from, 0)) % options.length);
      const hit = order.find(i => enabled(i) && options[i].label.toLowerCase().startsWith(typed.current.text));
      if (hit !== undefined) setActive(hit);
    }
  };

  return <div className={['msel', size === 'md' && 'msel--md', label && 'msel--labeled', open && 'msel--open', className].filter(Boolean).join(' ')}>
    <button
      ref={buttonRef}
      type="button"
      role="combobox"
      className="msel__btn"
      aria-label={ariaLabel}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listId : undefined}
      aria-activedescendant={open && active >= 0 ? `${uid}-opt-${active}` : undefined}
      disabled={disabled}
      onClick={() => (open ? close() : openMenu())}
      onKeyDown={onKeyDown}
    >
      {label && <span className="msel__label">{label}</span>}
      <span className="msel__value">{selected?.label ?? ''}</span>
      <ChevronDown className="msel__chev" size={18} aria-hidden="true" />
    </button>
    {open && placement && createPortal(
      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label={ariaLabel}
        className="msel__menu"
        data-above={placement.above}
        style={{ left: placement.left, minWidth: placement.minWidth, maxHeight: placement.maxHeight, top: placement.top, bottom: placement.bottom }}
      >
        {options.map((o, i) => <li
          key={o.value}
          id={`${uid}-opt-${i}`}
          role="option"
          data-index={i}
          aria-selected={o.value === value}
          aria-disabled={o.disabled || undefined}
          className={'msel__opt' + (i === active ? ' msel__opt--active' : '')}
          onMouseEnter={() => enabled(i) && setActive(i)}
          onMouseDown={e => e.preventDefault()}
          onClick={() => choose(i)}
        >
          <span>{o.label}</span>
          {o.value === value && <Check size={16} aria-hidden="true" />}
        </li>)}
      </ul>,
      document.body
    )}
  </div>;
}

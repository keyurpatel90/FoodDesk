import type { ProductUnit } from '@/lib/types';

export function money(value: number, symbol = '₹') {
  return `${symbol}${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;
}

export function csvEscape(value: unknown) {
  const s = String(value ?? '');
  return /[",;\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function isMeasuredUnit(unit?: ProductUnit | null): unit is 'kg' | 'litre' {
  return unit === 'kg' || unit === 'litre';
}

export function unitLabel(unit?: ProductUnit | null): string {
  if (unit === 'kg') return 'kg';
  if (unit === 'litre') return 'L';
  return 'piece';
}

export function inputUnit(unit?: ProductUnit | null): string {
  if (unit === 'kg') return 'g';
  if (unit === 'litre') return 'ml';
  return 'pcs';
}

export function formatQty(qty: number, unit?: ProductUnit | null): string {
  if (unit === 'kg') return `${Math.round(Number(qty) * 1000)} g`;
  if (unit === 'litre') return `${Math.round(Number(qty) * 1000)} ml`;
  return `${qty} pc`;
}

export function toDisplayQty(qty: number, unit?: ProductUnit | null): number {
  return isMeasuredUnit(unit) ? Math.round(Number(qty) * 1000) : Number(qty);
}

export function fromDisplayQty(display: number, unit?: ProductUnit | null): number {
  if (!Number.isFinite(display) || display <= 0) return 0;
  return isMeasuredUnit(unit) ? Number((display / 1000).toFixed(3)) : Number(display);
}

export function lineAmount(price: number, qty: number): number {
  return Math.round(Number(price) * Number(qty));
}

export function invoiceItemText(name: string, qty: number, price: number, unit: ProductUnit | null | undefined, symbol: string): string {
  return `${formatQty(qty, unit)} × ${name} (${money(price, symbol)}/${unitLabel(unit)})`;
}

export function compact(value: number): string {
  const n = Math.abs(Number(value) || 0);
  const sign = Number(value) < 0 ? '-' : '';
  const trim = (x: number) => String(Number(x.toFixed(1)));
  if (n >= 1e7) return `${sign}${trim(n / 1e7)}Cr`;
  if (n >= 1e5) return `${sign}${trim(n / 1e5)}L`;
  if (n >= 1e3) return `${sign}${trim(n / 1e3)}k`;
  return `${sign}${Math.round(n)}`;
}

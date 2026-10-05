export function money(value: number, symbol = '₹') {
  return `${symbol}${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;
}

export function csvEscape(value: unknown) {
  const s = String(value ?? '');
  return /[",;\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

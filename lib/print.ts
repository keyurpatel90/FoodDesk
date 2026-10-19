import type { Order } from '@/lib/types';
import { formatQty } from '@/lib/format';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/** Prints a compact kitchen ticket through a hidden frame, so it also works for automatic printing (no popup to block). */
export function printKitchenTicket(order: Order, businessName: string) {
  if (typeof document === 'undefined') return;
  const no = order.order_no < 0 ? `LOCAL-${Math.abs(order.order_no)}` : String(order.order_no);
  const items = order.items.filter(i => i.status !== 'cancelled');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Kitchen #${esc(no)}</title><style>
    @page{margin:4mm}body{font-family:Arial,sans-serif;width:72mm;margin:0 auto;color:#000}
    h1{font-size:15px;text-align:center;margin:4px 0}h2{font-size:26px;text-align:center;margin:2px 0}
    .tok{font-size:22px;font-weight:700;border:2px solid #000;padding:4px;text-align:center;margin:6px 0}
    .row{display:flex;justify-content:space-between;font-size:15px;margin:6px 0}.meta{font-size:12px;display:flex;justify-content:space-between}
    hr{border:0;border-top:1px dashed #000}.note{font-size:13px;border:1px solid #000;padding:4px;margin-top:6px}
  </style></head><body><h1>${esc(businessName)} · KITCHEN</h1><h2>#${esc(no)}</h2>
    ${order.token_no ? `<div class="tok">TOKEN ${esc(order.token_no)}</div>` : ''}
    <div class="meta"><span>${new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><span>${order.covers} cover${order.covers === 1 ? '' : 's'}</span></div><hr>
    ${items.map(i => `<div class="row"><b>${esc(formatQty(i.qty, i.unit_type))} × ${esc(i.product_name)}</b></div>`).join('')}
    ${order.notes ? `<div class="note">Note: ${esc(order.notes)}</div>` : ''}
  </body></html>`;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc || !frame.contentWindow) { frame.remove(); return; }
  doc.open(); doc.write(html); doc.close();
  const win = frame.contentWindow;
  window.setTimeout(() => { try { win.focus(); win.print(); } finally { window.setTimeout(() => frame.remove(), 2000); } }, 150);
}

'use client';

import { fromDisplayQty, inputUnit, lineAmount, money, unitLabel } from '@/lib/format';
import type { ProductUnit } from '@/lib/types';

type PricedItem = { name: string; price: number; unit_type: ProductUnit };

const PRESETS = [50, 100, 200, 250, 500, 1000];

export default function QtyPicker({
  product,
  currency,
  qty,
  onQty,
  onCancel,
  onConfirm,
}: {
  product: PricedItem;
  currency: string;
  qty: string;
  onQty: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const display = Number(qty);
  const stored = fromDisplayQty(display, product.unit_type);
  const amount = stored > 0 ? lineAmount(product.price, stored) : 0;
  const unit = inputUnit(product.unit_type);

  return (
    <div className="qtyModalBackdrop" onClick={onCancel} role="presentation">
      <div className="qtyModal" onClick={e => e.stopPropagation()} role="dialog" aria-labelledby="qty-picker-title">
        <h2 id="qty-picker-title">Add {product.name}</h2>
        <p className="hint">Rate {money(product.price, currency)} / {unitLabel(product.unit_type)}. Enter the quantity the customer asked for.</p>
        <label className="qtyBigLabel">
          Quantity ({unit})
          <input
            className="qtyBig"
            type="number"
            min="1"
            step="1"
            autoFocus
            value={qty}
            onChange={e => onQty(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => { if (e.key === 'Enter') onConfirm(); }}
          />
        </label>
        <div className="qtyPresets">
          {PRESETS.map(value => (
            <button key={value} type="button" className={'choice ' + (qty === String(value) ? 'selected' : '')} onClick={() => onQty(String(value))}>
              {value === 1000 ? (product.unit_type === 'kg' ? '1 kg' : '1 L') : `${value} ${unit}`}
            </button>
          ))}
        </div>
        <div className="summaryLine total" style={{ marginTop: 8, paddingTop: 8 }}>
          <span>Line total</span>
          <b>{money(amount, currency)}</b>
        </div>
        <div className="qtyModalActions">
          <button className="secondary" type="button" onClick={onCancel}>Cancel</button>
          <button className="primary" type="button" disabled={stored <= 0} onClick={onConfirm}>Add to cart</button>
        </div>
      </div>
    </div>
  );
}

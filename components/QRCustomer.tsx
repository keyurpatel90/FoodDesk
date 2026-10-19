'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatQty, fromDisplayQty, inputUnit, isMeasuredUnit, lineAmount, money, toDisplayQty, unitLabel } from '@/lib/format';
import type { ProductUnit } from '@/lib/types';
import QtyPicker from '@/components/QtyPicker';

type MenuProduct = { id: string; name: string; price: number; category?: string | null; unit_type: ProductUnit };

export default function QRCustomer({ token }: { token: string }) {
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<MenuProduct | null>(null);
  const [pickQty, setPickQty] = useState('200');

  useEffect(() => {
    supabase.rpc('qr_menu', { p_token: token }).then(({ data, error }) => {
      if (error) console.error(error);
      else setProducts(((data || []) as MenuProduct[]).map(p => ({ ...p, unit_type: p.unit_type || 'piece' })));
    });
  }, [token]);

  const selected = products.filter(p => cart[p.id]);
  const total = useMemo(() => selected.reduce((sum, p) => sum + lineAmount(p.price, cart[p.id]), 0), [selected, cart]);

  function addQty(product: MenuProduct, qty: number) {
    if (qty <= 0) return;
    setCart(current => ({ ...current, [product.id]: Number(((current[product.id] || 0) + qty).toFixed(3)) }));
  }

  function add(product: MenuProduct) {
    if (isMeasuredUnit(product.unit_type)) {
      setPicking(product);
      setPickQty('200');
      return;
    }
    addQty(product, 1);
  }

  function setDisplay(id: string, raw: string, unit: ProductUnit) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return;
    const qty = fromDisplayQty(value, unit);
    setCart(current => {
      const next = { ...current };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });
  }

  async function place() {
    if (!selected.length || busy) return;
    setBusy(true);
    const { error } = await supabase.rpc('place_qr_order', {
      p_token: token,
      p_items: selected.map(p => ({ product_id: p.id, qty: cart[p.id] })),
      p_customer_name: name,
      p_customer_phone: phone,
      p_notes: note,
    });
    setBusy(false);
    if (error) alert(error.message);
    else setSent(true);
  }

  if (sent) {
    return (
      <main className="authPage">
        <section className="card wizard center">
          <Check size={48}/>
          <h1>Order received</h1>
          <p>Your order has been sent to the event kitchen. Please wait for the counter/team to call your token.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="container">
      <div className="rolebar">
        <div>
          <span>Order from FoodDesk</span>
          <p className="hint">Scan → select quantity → submit. Payment is completed at the counter unless the event config says otherwise.</p>
        </div>
      </div>
      <div className="grid cashierGrid">
        <section className="card">
          <h2>Menu</h2>
          <div className="products">
            {products.map(p => (
              <button className="product" key={p.id} onClick={() => add(p)}>
                <strong>{p.name}</strong>
                <small>{p.category ?? ''}</small>
                <span>{money(p.price, '₹')} / {unitLabel(p.unit_type)}</span>
              </button>
            ))}
          </div>
        </section>
        <aside className="card cart">
          <h2>Your order</h2>
          {selected.map(p => (
            <div className="cartline" key={p.id}>
              <div>
                <b>{p.name}</b>
                <small>{money(p.price, '₹')} / {unitLabel(p.unit_type)} × {formatQty(cart[p.id], p.unit_type)} = {money(lineAmount(p.price, cart[p.id]), '₹')}</small>
              </div>
              <div className="qty">
                <button onClick={() => setDisplay(p.id, String(Math.max(0, toDisplayQty(cart[p.id], p.unit_type) - (isMeasuredUnit(p.unit_type) ? 50 : 1))), p.unit_type)}><Minus size={15}/></button>
                <input className="qtyInput" type="number" min="1" value={toDisplayQty(cart[p.id], p.unit_type)} onChange={e => setDisplay(p.id, e.target.value, p.unit_type)} />
                <small>{inputUnit(p.unit_type)}</small>
                <button onClick={() => addQty(p, isMeasuredUnit(p.unit_type) ? 0.05 : 1)}><Plus size={15}/></button>
              </div>
            </div>
          ))}
          <label>Name<input value={name} onChange={e => setName(e.target.value)} placeholder="Optional"/></label>
          <label>Phone<input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Optional"/></label>
          <label>Note<input value={note} onChange={e => setNote(e.target.value)} placeholder="Less spicy…"/></label>
          <div className="summaryLine total"><span>Total</span><b>{money(total, '₹')}</b></div>
          <button className="primary bigbtn" disabled={!selected.length || busy} onClick={() => void place()}>{busy ? 'Sending…' : 'SEND ORDER'} <Check size={18}/></button>
        </aside>
      </div>
      {picking && (
        <QtyPicker
          product={picking}
          currency="₹"
          qty={pickQty}
          onQty={setPickQty}
          onCancel={() => setPicking(null)}
          onConfirm={() => {
            addQty(picking, fromDisplayQty(Number(pickQty), picking.unit_type));
            setPicking(null);
          }}
        />
      )}
    </main>
  );
}

import React, { useState } from 'react';
import { MenuItem, Order, TableItem } from '@/lib/subscription-types';
import { Utensils, CheckCircle, Clock, ShoppingCart, Plus, Minus } from 'lucide-react';

interface CustomerQRViewProps {
  tables: TableItem[];
  menuItems: MenuItem[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  setTables: React.Dispatch<React.SetStateAction<TableItem[]>>;
  onOrderSuccess: () => void;
}

export const CustomerQRView: React.FC<CustomerQRViewProps> = ({
  tables,
  menuItems,
  setOrders,
  setTables,
  onOrderSuccess,
}) => {
  const [selectedTableNum, setSelectedTableNum] = useState<number>(1);
  const [cart, setCart] = useState<{ item: MenuItem; qty: number }[]>([]);
  const [guestName, setGuestName] = useState('Aarav Mehta');
  const [guestPhone, setGuestPhone] = useState('+91 98765 43210');
  const [orderPlaced, setOrderPlaced] = useState<Order | null>(null);

  const handleAddToCart = (item: MenuItem) => {
    setCart((prev) => {
      const found = prev.find((c) => c.item.id === item.id);
      if (found) {
        return prev.map((c) => (c.item.id === item.id ? { ...c, qty: c.qty + 1 } : c));
      }
      return [...prev, { item, qty: 1 }];
    });
  };

  const handleUpdateQty = (itemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.item.id === itemId) {
            const next = c.qty + delta;
            return next > 0 ? { ...c, qty: next } : null;
          }
          return c;
        })
        .filter(Boolean) as { item: MenuItem; qty: number }[]
    );
  };

  const cartTotal = cart.reduce((sum, c) => sum + c.item.price * c.qty, 0);

  const handlePlaceOrder = () => {
    if (cart.length === 0) return;

    const orderNumber = `#FD-${Math.floor(400 + Math.random() * 500)}`;
    const newOrder: Order = {
      id: `ord-${Date.now()}`,
      orderNumber,
      tableNumber: selectedTableNum,
      outletId: 'out-1',
      type: 'dine-in',
      status: 'new',
      createdAt: new Date().toISOString(),
      placedByRole: 'customer',
      placedByName: `Guest T${selectedTableNum}`,
      customerName: guestName,
      customerPhone: guestPhone,
      totalAmount: cartTotal,
      paymentStatus: 'unpaid',
      whatsappSent: false,
      prepTimeMinutes: Math.max(...cart.map((c) => c.item.prepTimeMinutes), 12),
      elapsedMinutes: 0,
      items: cart.map((c, idx) => ({
        id: `oi-qr-${Date.now()}-${idx}`,
        name: c.item.name,
        price: c.item.price,
        quantity: c.qty,
        station: c.item.station,
        isPrepared: false,
      })),
    };

    setOrders((prev) => [newOrder, ...prev]);

    // Set table occupied
    setTables((prev) =>
      prev.map((t) => (t.number === selectedTableNum ? { ...t, status: 'occupied', activeOrderId: newOrder.id } : t))
    );

    setOrderPlaced(newOrder);
    setCart([]);
    onOrderSuccess();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Customer Header Banner */}
      <div className="bg-[#6c5ce7] text-white p-6 rounded-2xl shadow-md text-center relative overflow-hidden">
        <div className="relative z-10">
          <div className="text-xs uppercase tracking-wider font-bold text-violet-200 mb-1">
            Dine-In Digital QR Ordering
          </div>
          <h2 className="text-2xl font-black tracking-tight">FoodDesk Cafe & Lounge</h2>
          <p className="text-xs text-violet-100 mt-1">
            Scan table QR, browse fresh artisanal dishes, and send order straight to kitchen.
          </p>

          <div className="mt-4 inline-flex items-center gap-2 bg-white/10 px-4 py-2 rounded-xl border border-white/20">
            <span className="text-xs text-violet-200">Seated at:</span>
            <select
              value={selectedTableNum}
              onChange={(e) => setSelectedTableNum(Number(e.target.value))}
              className="bg-white text-slate-900 font-bold text-xs rounded-lg px-2.5 py-1"
            >
              {tables.map((t) => (
                <option key={t.id} value={t.number}>
                  Table {t.number} ({t.name})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {orderPlaced ? (
        <div className="bg-white p-6 rounded-2xl border border-emerald-200 shadow-md text-center space-y-4">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Order Sent to Kitchen!</h3>
          <p className="text-xs text-slate-600 max-w-sm mx-auto">
            Your order <span className="font-mono font-bold text-slate-900">{orderPlaced.orderNumber}</span> has been received by our chefs and is being prepared for Table {orderPlaced.tableNumber}.
          </p>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 max-w-xs mx-auto">
            Estimated prep time: <span className="font-bold text-emerald-700">~{orderPlaced.prepTimeMinutes} mins</span>
          </div>
          <button
            onClick={() => setOrderPlaced(null)}
            className="py-2 px-4 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors"
          >
            Order More Items
          </button>
        </div>
      ) : null}

      {/* Menu List */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Utensils className="w-4 h-4 text-indigo-600" />
            <span>Artisanal Menu</span>
          </h3>
          <span className="text-xs text-slate-500">{menuItems.length} items</span>
        </div>

        <div className="divide-y divide-slate-100">
          {menuItems.map((item) => {
            const inCart = cart.find((c) => c.item.id === item.id);
            return (
              <div key={item.id} className="py-3 flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-2.5 h-2.5 rounded-xs border flex items-center justify-center ${
                        item.isVeg ? 'border-emerald-600' : 'border-rose-600'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${item.isVeg ? 'bg-emerald-600' : 'bg-rose-600'}`} />
                    </span>
                    <h4 className="text-xs font-bold text-slate-900">{item.name}</h4>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">{item.description}</p>
                  <div className="flex items-center gap-2 mt-1.5 text-xs">
                    <span className="font-black text-slate-900 tabular-nums">₹{item.price}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{item.prepTimeMinutes}m</span>
                    </span>
                  </div>
                </div>

                {inCart ? (
                  <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 px-2 py-1 rounded-lg">
                    <button
                      onClick={() => handleUpdateQty(item.id, -1)}
                      className="w-5 h-5 flex items-center justify-center text-indigo-700 font-bold"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="font-bold text-indigo-900 text-xs tabular-nums">{inCart.qty}</span>
                    <button
                      onClick={() => handleUpdateQty(item.id, 1)}
                      className="w-5 h-5 flex items-center justify-center text-indigo-700 font-bold"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleAddToCart(item)}
                    className="py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                  >
                    + Add
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating Bottom Cart Bar */}
      {cart.length > 0 && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xl sticky bottom-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs text-slate-500">
              {cart.reduce((s, c) => s + c.qty, 0)} items in ticket
            </div>
            <div className="text-lg font-black text-slate-900 tabular-nums">₹{cartTotal}</div>
          </div>

          <button
            onClick={handlePlaceOrder}
            className="py-2.5 px-5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Send to Kitchen (Table {selectedTableNum})</span>
          </button>
        </div>
      )}
    </div>
  );
};

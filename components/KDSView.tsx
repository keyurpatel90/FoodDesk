import React, { useState } from 'react';
import { Order, OrderStatus, KitchenStation, SubscriptionState } from '@/lib/subscription-types';
import { subscriptionService } from '@/lib/subscription';
import { Bell, Flame, CheckCircle, Clock, Volume2, Lock, ChefHat, Sparkles } from 'lucide-react';

interface KDSViewProps {
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  subscription: SubscriptionState;
  onOpenPricing: () => void;
}

export const KDSView: React.FC<KDSViewProps> = ({
  orders,
  setOrders,
  subscription,
  onOpenPricing,
}) => {
  const [selectedStation, setSelectedStation] = useState<KitchenStation | 'all'>('all');
  const [lastChimeMessage, setLastChimeMessage] = useState<string | null>(null);

  const hasAudioAlerts = subscriptionService.hasFeature('kdsAudioAlerts');
  const hasMultiStation = subscriptionService.hasFeature('multiStationKDS');

  // Trigger test audio chime
  const handlePlayChime = () => {
    if (!hasAudioAlerts) {
      onOpenPricing();
      return;
    }
    // Web Audio API beep simulation
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);

      setLastChimeMessage('🔔 Kitchen Bell Chime Played (New Order Incoming)');
      setTimeout(() => setLastChimeMessage(null), 3000);
    } catch {
      setLastChimeMessage('🔔 Bell Chime Triggered');
      setTimeout(() => setLastChimeMessage(null), 3000);
    }
  };

  const handleUpdateStatus = (orderId: string, nextStatus: OrderStatus) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o))
    );
  };

  const handleToggleItemPrepared = (orderId: string, itemId: string) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id === orderId) {
          const updatedItems = o.items.map((i) =>
            i.id === itemId ? { ...i, isPrepared: !i.isPrepared } : i
          );
          return { ...o, items: updatedItems };
        }
        return o;
      })
    );
  };

  // Filter orders by station if enabled
  const filterOrderByStation = (order: Order) => {
    if (selectedStation === 'all') return true;
    return order.items.some((i) => i.station === selectedStation);
  };

  const newOrders = orders.filter((o) => o.status === 'new' && filterOrderByStation(o));
  const prepOrders = orders.filter((o) => o.status === 'preparing' && filterOrderByStation(o));
  const readyOrders = orders.filter((o) => o.status === 'ready' && filterOrderByStation(o));
  const completedOrders = orders.filter((o) => o.status === 'delivered' && filterOrderByStation(o));

  return (
    <div className="space-y-5">
      {/* KDS Header & Controls */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
            <ChefHat className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Kitchen Display System (KDS)</h2>
            <div className="text-xs text-slate-500">Live order tickets for kitchen line & expediter</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Audio Chime Button */}
          <button
            onClick={handlePlayChime}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              hasAudioAlerts
                ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200 border border-slate-200'
            }`}
          >
            <Volume2 className="w-4 h-4 text-amber-600" />
            <span>Test Kitchen Chime</span>
            {!hasAudioAlerts && (
              <span className="text-[10px] bg-slate-200 px-1.5 py-0.2 rounded text-slate-600 flex items-center gap-0.5">
                <Lock className="w-2.5 h-2.5" /> Pro Plan
              </span>
            )}
          </button>

          {/* Multi-Station Routing Filter */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500 px-2">Station:</span>
            {['all', 'hot', 'cold', 'beverage', 'bakery'].map((st) => (
              <button
                key={st}
                onClick={() => {
                  if (!hasMultiStation && st !== 'all') {
                    onOpenPricing();
                    return;
                  }
                  setSelectedStation(st as typeof selectedStation);
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-all cursor-pointer ${
                  selectedStation === st
                    ? 'bg-white text-slate-900 font-bold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st}
              </button>
            ))}

            {!hasMultiStation && (
              <span
                onClick={onOpenPricing}
                className="cursor-pointer ml-1 text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold px-2 py-0.5 rounded-md flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3 text-emerald-600" />
                <span>Enterprise Multi-Station</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {lastChimeMessage && (
        <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold rounded-lg text-center animate-bounce">
          {lastChimeMessage}
        </div>
      )}

      {/* Kanban 4 Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Column 1: New Orders */}
        <div className="bg-slate-100/70 p-3.5 rounded-2xl border border-slate-200 flex flex-col min-h-[500px]">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-rose-500 animate-pulse" />
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">New Tickets</h3>
            </div>
            <span className="text-xs font-bold text-slate-700 bg-white px-2 py-0.5 rounded-full border border-slate-200 tabular-nums">
              {newOrders.length}
            </span>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto">
            {newOrders.length === 0 ? (
              <div className="text-center py-12 text-xs text-slate-400">No new incoming tickets</div>
            ) : (
              newOrders.map((order) => (
                <div
                  key={order.id}
                  className="bg-white p-4 rounded-xl border border-rose-200 shadow-2xs space-y-3 ring-1 ring-rose-100"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-black text-rose-600 font-mono">{order.orderNumber}</span>
                      <div className="text-xs font-bold text-slate-900">
                        {order.tableNumber ? `Table ${order.tableNumber}` : 'Takeaway'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-slate-400 flex items-center gap-1 justify-end">
                        <Clock className="w-3 h-3" />
                        <span>Just in</span>
                      </div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">{order.placedByName}</div>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100 text-xs">
                    {order.items.map((item) => (
                      <div key={item.id} className="py-1.5 flex items-start justify-between">
                        <div>
                          <span className="font-bold text-slate-900 tabular-nums mr-1.5">{item.quantity}×</span>
                          <span className="text-slate-800 font-medium">{item.name}</span>
                          {item.notes && (
                            <div className="text-[10px] text-amber-700 italic">Note: {item.notes}</div>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 uppercase">{item.station}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => handleUpdateStatus(order.id, 'preparing')}
                    className="w-full py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Flame className="w-3.5 h-3.5" />
                    <span>Start Cooking</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Column 2: Preparing */}
        <div className="bg-slate-100/70 p-3.5 rounded-2xl border border-slate-200 flex flex-col min-h-[500px]">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-orange-500" />
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">In Kitchen (Prep)</h3>
            </div>
            <span className="text-xs font-bold text-slate-700 bg-white px-2 py-0.5 rounded-full border border-slate-200 tabular-nums">
              {prepOrders.length}
            </span>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto">
            {prepOrders.length === 0 ? (
              <div className="text-center py-12 text-xs text-slate-400">No tickets cooking</div>
            ) : (
              prepOrders.map((order) => (
                <div key={order.id} className="bg-white p-4 rounded-xl border border-orange-200 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-orange-700 font-mono">{order.orderNumber}</span>
                      <div className="text-xs font-bold text-slate-900">
                        {order.tableNumber ? `Table ${order.tableNumber}` : 'Takeaway'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] font-semibold text-orange-600 flex items-center gap-1 justify-end tabular-nums">
                        <Clock className="w-3 h-3" />
                        <span>~{order.prepTimeMinutes}m prep</span>
                      </div>
                      <div className="text-[10px] text-slate-400">{order.customerName}</div>
                    </div>
                  </div>

                  {/* Checklist items */}
                  <div className="divide-y divide-slate-100 text-xs">
                    {order.items.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleToggleItemPrepared(order.id, item.id)}
                        className={`py-1.5 flex items-start justify-between cursor-pointer rounded px-1 transition-colors ${
                          item.isPrepared ? 'bg-emerald-50/70 text-slate-400 line-through' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={!!item.isPrepared}
                            onChange={() => {}}
                            className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-0"
                          />
                          <span className="font-bold tabular-nums">{item.quantity}×</span>
                          <span className="font-medium">{item.name}</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 uppercase">{item.station}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => handleUpdateStatus(order.id, 'ready')}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Mark All Ready</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Column 3: Ready for Pickup */}
        <div className="bg-slate-100/70 p-3.5 rounded-2xl border border-slate-200 flex flex-col min-h-[500px]">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500" />
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Ready to Serve</h3>
            </div>
            <span className="text-xs font-bold text-slate-700 bg-white px-2 py-0.5 rounded-full border border-slate-200 tabular-nums">
              {readyOrders.length}
            </span>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto">
            {readyOrders.length === 0 ? (
              <div className="text-center py-12 text-xs text-slate-400">No ready dishes waiting</div>
            ) : (
              readyOrders.map((order) => (
                <div key={order.id} className="bg-white p-4 rounded-xl border border-emerald-300 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-emerald-700 font-mono">{order.orderNumber}</span>
                      <div className="text-xs font-bold text-slate-900">
                        {order.tableNumber ? `Table ${order.tableNumber}` : 'Takeaway'}
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                      Plated & Ready
                    </span>
                  </div>

                  <div className="text-xs text-slate-700">
                    <div className="font-semibold text-slate-900 mb-1">Items to deliver:</div>
                    <ul className="list-disc pl-4 space-y-0.5 text-slate-600">
                      {order.items.map((item) => (
                        <li key={item.id}>
                          {item.quantity}× {item.name}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    onClick={() => handleUpdateStatus(order.id, 'delivered')}
                    className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Bell className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Confirm Delivered to Table</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Column 4: Delivered / Completed */}
        <div className="bg-slate-100/70 p-3.5 rounded-2xl border border-slate-200 flex flex-col min-h-[500px]">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-slate-400" />
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Delivered</h3>
            </div>
            <span className="text-xs font-bold text-slate-700 bg-white px-2 py-0.5 rounded-full border border-slate-200 tabular-nums">
              {completedOrders.length}
            </span>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto">
            {completedOrders.length === 0 ? (
              <div className="text-center py-12 text-xs text-slate-400">No completed orders yet</div>
            ) : (
              completedOrders.slice(0, 5).map((order) => (
                <div key={order.id} className="bg-white/80 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-700">{order.orderNumber}</span>
                    <span className="text-[10px] font-semibold text-slate-500">
                      {order.tableNumber ? `Table ${order.tableNumber}` : 'Takeaway'}
                    </span>
                  </div>
                  <div className="text-slate-500 text-[11px] truncate">
                    {order.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-100">
                    <span>Delivered & Served</span>
                    <span className="font-semibold text-slate-700 tabular-nums">₹{order.totalAmount}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

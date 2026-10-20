import React, { useState } from 'react';
import { TableItem, Order, MenuItem, UserRole, SubscriptionState } from '@/lib/subscription-types';
import { subscriptionService } from '@/lib/subscription';
import {
  Plus,
  ShoppingBag,
  Utensils,
  CheckCircle,
  Clock,
  QrCode,
  Lock,
  X,
  Receipt,
  Users,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

interface OrdersViewProps {
  tables: TableItem[];
  setTables: React.Dispatch<React.SetStateAction<TableItem[]>>;
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  menuItems: MenuItem[];
  currentRole: UserRole;
  subscription: SubscriptionState;
  onOpenPricing: () => void;
}

export const OrdersView: React.FC<OrdersViewProps> = ({
  tables,
  setTables,
  orders,
  setOrders,
  menuItems,
  currentRole,
  subscription,
  onOpenPricing,
}) => {
  const [selectedTable, setSelectedTable] = useState<TableItem | null>(null);
  const [cart, setCart] = useState<{ item: MenuItem; qty: number; notes: string }[]>([]);
  const [orderType, setOrderType] = useState<'dine-in' | 'takeaway'>('dine-in');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [qrModalTable, setQrModalTable] = useState<TableItem | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'vacant' | 'occupied' | 'billing'>('all');

  const tableLimit = subscriptionService.getTableLimit();
  const currentTableCount = tables.length;
  const isTableLimitReached = currentTableCount >= tableLimit;

  // Add new table
  const handleAddNewTable = () => {
    if (isTableLimitReached) {
      onOpenPricing();
      return;
    }
    const newNum = tables.length + 1;
    const newTable: TableItem = {
      id: `t${newNum}`,
      number: newNum,
      name: `Table ${newNum} (Indoor)`,
      capacity: 4,
      status: 'vacant',
    };
    setTables((prev) => [...prev, newTable]);
  };

  // Quick table status change by waitstaff
  const handleQuickStatusChange = (tableId: string, newStatus: 'vacant' | 'occupied' | 'billing', e: React.MouseEvent) => {
    e.stopPropagation();
    setTables((prev) =>
      prev.map((t) => (t.id === tableId ? { ...t, status: newStatus } : t))
    );
  };

  const handleAddToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === item.id);
      if (existing) {
        return prev.map((c) => (c.item.id === item.id ? { ...c, qty: c.qty + 1 } : c));
      }
      return [...prev, { item, qty: 1, notes: '' }];
    });
  };

  const handleUpdateQty = (itemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.item.id === itemId) {
            const newQty = c.qty + delta;
            return newQty > 0 ? { ...c, qty: newQty } : null;
          }
          return c;
        })
        .filter(Boolean) as { item: MenuItem; qty: number; notes: string }[]
    );
  };

  const cartTotal = cart.reduce((sum, c) => sum + c.item.price * c.qty, 0);

  const handleSendToKitchen = () => {
    if (!selectedTable && orderType === 'dine-in') {
      alert('Please select a table for Dine-in orders');
      return;
    }
    if (cart.length === 0) return;

    const newOrderNumber = `#FD-${Math.floor(400 + Math.random() * 500)}`;
    const newOrder: Order = {
      id: `ord-${Date.now()}`,
      orderNumber: newOrderNumber,
      tableNumber: selectedTable?.number || 0,
      outletId: 'out-1',
      type: orderType,
      status: 'new',
      createdAt: new Date().toISOString(),
      placedByRole: currentRole,
      placedByName: currentRole === 'waiter' ? 'Captain Waiter' : 'Admin Staff',
      customerName: customerName || (selectedTable ? `Guest T${selectedTable.number}` : 'Walk-in Guest'),
      customerPhone: customerPhone || '+91 98765 00000',
      totalAmount: cartTotal,
      paymentStatus: 'unpaid',
      whatsappSent: false,
      prepTimeMinutes: Math.max(...cart.map((c) => c.item.prepTimeMinutes), 10),
      elapsedMinutes: 0,
      items: cart.map((c, idx) => ({
        id: `oi-${Date.now()}-${idx}`,
        name: c.item.name,
        price: c.item.price,
        quantity: c.qty,
        station: c.item.station,
        notes: c.notes,
        isPrepared: false,
      })),
    };

    setOrders((prev) => [newOrder, ...prev]);

    // Update table status if dine-in
    if (selectedTable) {
      setTables((prev) =>
        prev.map((t) => (t.id === selectedTable.id ? { ...t, status: 'occupied', activeOrderId: newOrder.id } : t))
      );
    }

    // Reset cart
    setCart([]);
    setSelectedTable(null);
    setCustomerName('');
    setCustomerPhone('');
  };

  const categories = ['All', 'Main Course', 'Rice & Biryani', 'Appetizers', 'Pizzas', 'Beverages', 'Desserts'];

  const filteredMenuItems =
    activeCategory === 'All'
      ? menuItems
      : menuItems.filter((m) => m.category.toLowerCase() === activeCategory.toLowerCase());

  // Filter tables based on status filter
  const filteredTables =
    statusFilter === 'all'
      ? tables
      : tables.filter((t) => t.status === statusFilter);

  const vacantCount = tables.filter((t) => t.status === 'vacant').length;
  const occupiedCount = tables.filter((t) => t.status === 'occupied').length;
  const billingCount = tables.filter((t) => t.status === 'billing').length;

  return (
    <div className="space-y-6">
      {/* Tier Limits Banner */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-4 shadow-2xs">
        <div>
          <div className="text-xs uppercase font-bold tracking-wider text-slate-500">Table Capacity & Tier Status</div>
          <div className="text-sm font-semibold text-slate-900 mt-0.5">
            Active Tables: <span className="text-indigo-600 font-bold">{tables.length}</span> /{' '}
            <span>{tableLimit === 9999 ? 'Unlimited' : tableLimit}</span>
            <span className="text-xs font-normal text-slate-500 ml-2">
              (Tier: <span className="capitalize font-semibold text-slate-800">{subscription.tier}</span>)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isTableLimitReached && (
            <button
              onClick={onOpenPricing}
              className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5 text-amber-600" />
              <span>Table limit reached ({tableLimit}). Upgrade Tier</span>
            </button>
          )}

          <button
            onClick={handleAddNewTable}
            className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <Plus className="w-4 h-4" />
            <span>Add Table</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Tables Grid & Order Mode (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
            {/* Header & Quick Status Filters */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>Floor Tables Layout</span>
                  <span className="text-xs font-normal text-slate-500">({tables.length} total)</span>
                </h2>
                <div className="text-xs text-slate-500 mt-0.5">
                  Dynamic visual indicators for instant waitstaff recognition
                </div>
              </div>

              {/* Status Filter Buttons */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    statusFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({tables.length})
                </button>

                <button
                  type="button"
                  onClick={() => setStatusFilter('vacant')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    statusFilter === 'vacant'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>Available ({vacantCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStatusFilter('occupied')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    statusFilter === 'occupied'
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'text-amber-700 hover:bg-amber-50'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span>Occupied ({occupiedCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStatusFilter('billing')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    statusFilter === 'billing'
                      ? 'bg-violet-600 text-white shadow-2xs'
                      : 'text-violet-700 hover:bg-violet-50'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-violet-400 animate-ping" />
                  <span>Awaiting Bill ({billingCount})</span>
                </button>
              </div>
            </div>

            {/* Table Floor Grid with dynamic visual indicators */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
              {filteredTables.map((table) => {
                const isSelected = selectedTable?.id === table.id;
                const activeOrder = orders.find(
                  (o) => o.tableNumber === table.number && o.paymentStatus === 'unpaid'
                );

                // Dynamic visual styling per status
                let containerClasses = '';
                let statusBadge = null;
                let ringHighlight = '';

                if (table.status === 'vacant') {
                  // Available / Vacant State: Crisp emerald styling
                  containerClasses =
                    'border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50/80 hover:border-emerald-300';
                  ringHighlight = isSelected ? 'ring-2 ring-emerald-500 shadow-md' : 'shadow-2xs';
                  statusBadge = (
                    <div className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded-full border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>Available</span>
                    </div>
                  );
                } else if (table.status === 'occupied') {
                  // Occupied State: Warm Amber/Orange with pulsing active indicator
                  containerClasses =
                    'border-amber-300 bg-amber-50/60 hover:bg-amber-50/90 hover:border-amber-400';
                  ringHighlight = isSelected
                    ? 'ring-2 ring-amber-500 shadow-md'
                    : 'shadow-2xs';
                  statusBadge = (
                    <div className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100/90 px-2 py-0.5 rounded-full border border-amber-300 shadow-2xs">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      <span>Occupied · Dining</span>
                    </div>
                  );
                } else {
                  // Awaiting Bill State: High urgency violet/rose with active pulsing animation!
                  containerClasses =
                    'border-violet-400 bg-violet-50/70 hover:bg-violet-100/80 animate-pulse-subtle';
                  ringHighlight = isSelected
                    ? 'ring-2 ring-violet-600 shadow-lg'
                    : 'ring-1 ring-violet-300 shadow-sm';
                  statusBadge = (
                    <div className="inline-flex items-center gap-1 text-[10px] font-black text-violet-900 bg-violet-200/90 px-2.5 py-0.5 rounded-full border border-violet-400 shadow-xs">
                      <Receipt className="w-3 h-3 text-violet-700 animate-bounce" />
                      <span>AWAITING BILL</span>
                    </div>
                  );
                }

                return (
                  <div
                    key={table.id}
                    onClick={() => setSelectedTable(table)}
                    className={`relative p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between min-h-[145px] ${containerClasses} ${ringHighlight}`}
                  >
                    {/* Top Row: Table Number & Status Badge */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-base font-extrabold text-slate-900 tracking-tight">
                            T{table.number}
                          </span>
                          <span className="text-[11px] text-slate-500 font-medium">({table.name})</span>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setQrModalTable(table);
                          }}
                          title="Generate Table QR Code"
                          className="p-1 rounded-md text-slate-400 hover:text-slate-800 hover:bg-white/80 transition-colors"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between mt-1">
                        {statusBadge}
                        <div className="text-[11px] text-slate-500 flex items-center gap-1">
                          <Users className="w-3 h-3 text-slate-400" />
                          <span>{table.capacity}p</span>
                        </div>
                      </div>
                    </div>

                    {/* Middle Info: Order details or ready state */}
                    <div className="my-2 py-1.5 border-t border-slate-200/60 text-xs">
                      {table.status === 'vacant' ? (
                        <div className="text-[11px] text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Sanitized & Ready to Seat</span>
                        </div>
                      ) : activeOrder ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-mono font-bold text-slate-800">{activeOrder.orderNumber}</span>
                            <span className="font-extrabold text-slate-900 tabular-nums">
                              ₹{activeOrder.totalAmount}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 truncate flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>
                              {activeOrder.items.length} items · Status:{' '}
                              <span className="font-semibold capitalize text-slate-700">
                                {activeOrder.status}
                              </span>
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-500">Seated · No ticket placed yet</div>
                      )}
                    </div>

                    {/* Bottom Row: Quick Status Actions for Waitstaff */}
                    <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between gap-1">
                      {table.status === 'vacant' ? (
                        <button
                          type="button"
                          onClick={(e) => handleQuickStatusChange(table.id, 'occupied', e)}
                          className="w-full py-1 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold transition-colors flex items-center justify-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Seat Guests / Order</span>
                        </button>
                      ) : table.status === 'occupied' ? (
                        <div className="flex items-center gap-1 w-full">
                          <button
                            type="button"
                            onClick={(e) => handleQuickStatusChange(table.id, 'billing', e)}
                            className="flex-1 py-1 px-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-[10px] font-bold transition-colors flex items-center justify-center gap-1"
                          >
                            <Receipt className="w-3 h-3" />
                            <span>Request Bill</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleQuickStatusChange(table.id, 'vacant', e)}
                            title="Mark Vacant"
                            className="py-1 px-1.5 bg-white/80 hover:bg-white text-slate-600 rounded-lg text-[10px] font-medium border border-slate-200"
                          >
                            Free
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => handleQuickStatusChange(table.id, 'vacant', e)}
                          className="w-full py-1 px-2 bg-violet-800 hover:bg-violet-900 text-white rounded-lg text-[10px] font-bold transition-colors flex items-center justify-center gap-1 shadow-xs"
                        >
                          <CheckCircle className="w-3 h-3 text-emerald-300" />
                          <span>Clear Table & Mark Vacant</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Menu Catalog */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Add Items to Ticket</h2>
                <div className="text-xs text-slate-500">
                  {selectedTable ? (
                    <span className="font-semibold text-indigo-600">
                      Ordering for Table {selectedTable.number} ({selectedTable.name})
                    </span>
                  ) : (
                    'Select a table above or order for takeaway'
                  )}
                </div>
              </div>
              <div className="text-xs text-slate-500">{filteredMenuItems.length} dishes available</div>
            </div>

            {/* Category tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-4 scrollbar-none">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    activeCategory === cat
                      ? 'bg-indigo-600 text-white font-semibold shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Dishes list */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredMenuItems.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl border border-slate-200 hover:border-slate-300 transition-all flex items-start justify-between gap-3 bg-white hover:bg-slate-50/50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2.5 h-2.5 rounded-xs border flex items-center justify-center shrink-0 ${
                          item.isVeg ? 'border-emerald-600' : 'border-rose-600'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${item.isVeg ? 'bg-emerald-600' : 'bg-rose-600'}`} />
                      </span>
                      <h4 className="text-xs font-bold text-slate-900 truncate">{item.name}</h4>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{item.description}</p>
                    <div className="flex items-center gap-2 mt-2 text-xs">
                      <span className="font-bold text-slate-900 tabular-nums">₹{item.price}</span>
                      <span className="text-[10px] text-slate-400">·</span>
                      <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{item.prepTimeMinutes}m</span>
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleAddToCart(item)}
                    className="p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0"
                  >
                    + Add
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Side: Active Ticket / Cart (5 cols) */}
        <div className="lg:col-span-5">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs sticky top-20">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">New Kitchen Ticket</h3>
              </div>
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs">
                <button
                  onClick={() => setOrderType('dine-in')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    orderType === 'dine-in' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'text-slate-500'
                  }`}
                >
                  Dine-In
                </button>
                <button
                  onClick={() => setOrderType('takeaway')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    orderType === 'takeaway' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'text-slate-500'
                  }`}
                >
                  Takeaway
                </button>
              </div>
            </div>

            {/* Table or Customer Info */}
            <div className="py-3 border-b border-slate-100 space-y-2 text-xs">
              {orderType === 'dine-in' ? (
                <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="text-slate-600">Selected Table:</span>
                  <span className="font-bold text-slate-900">
                    {selectedTable ? `Table ${selectedTable.number} (${selectedTable.name})` : 'Select a table from grid'}
                  </span>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Customer Name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                />
                <input
                  type="text"
                  placeholder="WhatsApp Mobile"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                />
              </div>
            </div>

            {/* Cart Items List */}
            <div className="py-3 divide-y divide-slate-100 min-h-[160px] max-h-[280px] overflow-y-auto">
              {cart.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs flex flex-col items-center justify-center">
                  <Utensils className="w-8 h-8 text-slate-300 stroke-[1.5] mb-2" />
                  <span>No dishes added to ticket yet.</span>
                  <span className="text-[11px] text-slate-400 mt-1">Select items from menu catalog</span>
                </div>
              ) : (
                cart.map((c) => (
                  <div key={c.item.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="flex-1 pr-2">
                      <div className="font-semibold text-slate-900 truncate">{c.item.name}</div>
                      <div className="text-[11px] text-slate-500 tabular-nums">
                        ₹{c.item.price} × {c.qty} = ₹{c.item.price * c.qty}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded-md">
                      <button
                        onClick={() => handleUpdateQty(c.item.id, -1)}
                        className="w-5 h-5 flex items-center justify-center font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
                      >
                        -
                      </button>
                      <span className="font-bold text-slate-900 tabular-nums text-xs">{c.qty}</span>
                      <button
                        onClick={() => handleUpdateQty(c.item.id, 1)}
                        className="w-5 h-5 flex items-center justify-center font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Cart Summary & Send to Kitchen Button */}
            <div className="pt-3 border-t border-slate-200 space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Subtotal ({cart.reduce((s, c) => s + c.qty, 0)} items)</span>
                <span className="font-bold text-slate-900 tabular-nums text-sm">₹{cartTotal}</span>
              </div>

              <button
                onClick={handleSendToKitchen}
                disabled={cart.length === 0}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Fire Order to Kitchen (KDS)</span>
              </button>

              <div className="text-[11px] text-center text-slate-400">
                Ticket will appear instantly on Head Chef&apos;s KDS display
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* QR Code Modal for Table Dine-In */}
      {qrModalTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 text-center border border-slate-200 shadow-xl relative">
            <button
              onClick={() => setQrModalTable(null)}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-slate-900 mb-1">
              Table {qrModalTable.number} QR Code
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Guests scan this QR to order directly from their smartphones.
            </p>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl inline-block mb-4">
              <div className="w-44 h-44 bg-white border border-slate-300 rounded-lg p-3 flex items-center justify-center shadow-2xs">
                <div className="w-full h-full bg-slate-900 p-2 rounded flex flex-col items-center justify-center text-white">
                  <QrCode className="w-24 h-24 text-white" />
                  <span className="text-[10px] font-bold tracking-wider uppercase mt-1">
                    FoodDesk T{qrModalTable.number}
                  </span>
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-600 mb-4 font-mono bg-slate-100 py-1.5 px-3 rounded-lg">
              https://fooddesk.cafe/dine-in?table={qrModalTable.number}
            </div>

            <button
              onClick={() => setQrModalTable(null)}
              className="w-full py-2.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Done / Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

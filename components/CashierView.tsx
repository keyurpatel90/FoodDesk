import React, { useState } from 'react';
import { Order, SubscriptionState } from '@/lib/subscription-types';
import { subscriptionService } from '@/lib/subscription';
import { Receipt, MessageSquare, Printer, CheckCircle2, Lock, ExternalLink, X, Send } from 'lucide-react';

interface CashierViewProps {
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  subscription: SubscriptionState;
  onOpenPricing: () => void;
}

export const CashierView: React.FC<CashierViewProps> = ({
  orders,
  setOrders,
  subscription,
  onOpenPricing,
}) => {
  const [selectedOrderForInvoice, setSelectedOrderForInvoice] = useState<Order | null>(null);
  const [selectedOrderForPrint, setSelectedOrderForPrint] = useState<Order | null>(null);
  const [customPhone, setCustomPhone] = useState('');
  const [whatsAppDeliveryStatus, setWhatsAppDeliveryStatus] = useState<string | null>(null);

  const hasWhatsAppInvoices = subscriptionService.hasFeature('whatsappInvoices');

  const handleSettleBill = (orderId: string) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, paymentStatus: 'paid' } : o))
    );
  };

  const handleOpenWhatsAppModal = (order: Order) => {
    if (!hasWhatsAppInvoices) {
      onOpenPricing();
      return;
    }
    setSelectedOrderForInvoice(order);
    setCustomPhone(order.customerPhone || '+91 98765 43210');
    setWhatsAppDeliveryStatus(null);
  };

  const formatWhatsAppMessage = (order: Order) => {
    const itemsList = order.items
      .map((i) => `• ${i.quantity}x ${i.name} - ₹${i.price * i.quantity}`)
      .join('\n');
    const gst = Math.round(order.totalAmount * 0.05);
    const grandTotal = order.totalAmount + gst;

    return `🍽️ *FOODDESK RESTAURANT BILL*\nOrder: ${order.orderNumber} | Table: ${
      order.tableNumber || 'Takeaway'
    }\nGuest: ${order.customerName || 'Guest'}\n\n*Ordered Items:*\n${itemsList}\n\nSubtotal: ₹${
      order.totalAmount
    }\nGST (5%): ₹${gst}\n*Grand Total: ₹${grandTotal}*\nPayment: ${order.paymentStatus.toUpperCase()}\n\nThank you for dining with us! Visit again.`;
  };

  const handleSendWhatsApp = () => {
    if (!selectedOrderForInvoice) return;

    setWhatsAppDeliveryStatus('sending');
    setTimeout(() => {
      setWhatsAppDeliveryStatus('delivered');
      setOrders((prev) =>
        prev.map((o) => (o.id === selectedOrderForInvoice.id ? { ...o, whatsappSent: true } : o))
      );
    }, 1200);
  };

  const unpaidOrders = orders.filter((o) => o.paymentStatus === 'unpaid');
  const paidOrders = orders.filter((o) => o.paymentStatus === 'paid');

  return (
    <div className="space-y-6">
      {/* Header & WhatsApp Feature Highlight */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Cashier Billing & Tax Invoices</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Collect payment, print thermal slips, and deliver instant WhatsApp digital invoices.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-2 ${
              hasWhatsAppInvoices
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-slate-50 text-slate-500 border-slate-200 cursor-pointer'
            }`}
            onClick={!hasWhatsAppInvoices ? onOpenPricing : undefined}
          >
            <MessageSquare className={`w-4 h-4 ${hasWhatsAppInvoices ? 'text-emerald-600' : 'text-slate-400'}`} />
            <span>WhatsApp Invoice Delivery: {hasWhatsAppInvoices ? 'Active (Pro)' : 'Locked (Starter)'}</span>
            {!hasWhatsAppInvoices && (
              <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded font-bold">
                Upgrade
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Unsettled Bills vs Settled Bills */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Unpaid Bills (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span>Pending Bills to Settle ({unpaidOrders.length})</span>
            </h3>
          </div>

          {unpaidOrders.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-xs text-slate-400">
              All active orders have been billed and settled.
            </div>
          ) : (
            <div className="space-y-3">
              {unpaidOrders.map((order) => {
                const gst = Math.round(order.totalAmount * 0.05);
                const grandTotal = order.totalAmount + gst;

                return (
                  <div
                    key={order.id}
                    className="bg-white p-4 rounded-xl border border-slate-200 hover:border-slate-300 transition-all shadow-2xs space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-mono font-bold text-slate-900">{order.orderNumber}</span>
                        <div className="text-sm font-bold text-slate-900">
                          {order.tableNumber ? `Table ${order.tableNumber}` : 'Takeaway Order'}
                        </div>
                        <div className="text-xs text-slate-500">
                          Guest: <span className="font-medium text-slate-800">{order.customerName}</span> ·{' '}
                          <span className="font-mono">{order.customerPhone}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs text-slate-500">Payable Amount</div>
                        <div className="text-xl font-black text-slate-900 tabular-nums">₹{grandTotal}</div>
                        <div className="text-[10px] text-slate-400">(incl. ₹{gst} GST)</div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        {/* Print Receipt */}
                        <button
                          onClick={() => setSelectedOrderForPrint(order)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5 text-slate-500" />
                          <span>Print Bill</span>
                        </button>

                        {/* WhatsApp Invoice Button (Tier Gated!) */}
                        <button
                          onClick={() => handleOpenWhatsAppModal(order)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                            hasWhatsAppInvoices
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>WhatsApp Invoice</span>
                          {!hasWhatsAppInvoices && <Lock className="w-3 h-3 text-amber-600" />}
                        </button>
                      </div>

                      {/* Settle Bill Button */}
                      <button
                        onClick={() => handleSettleBill(order.id)}
                        className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                      >
                        Mark as Paid (Settle)
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Settled Orders History (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>Settled Today ({paidOrders.length})</span>
          </h3>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 divide-y divide-slate-100 space-y-2">
            {paidOrders.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">No settled bills today yet</div>
            ) : (
              paidOrders.map((order) => (
                <div key={order.id} className="pt-2 first:pt-0 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-slate-900 flex items-center gap-1.5">
                      <span>{order.orderNumber}</span>
                      <span className="text-[10px] text-slate-500">
                        ({order.tableNumber ? `T${order.tableNumber}` : 'Takeaway'})
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {order.customerName} · {order.items.length} items
                    </div>
                    {order.whatsappSent && (
                      <div className="text-[10px] text-emerald-600 font-medium flex items-center gap-0.5 mt-0.5">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>WhatsApp Sent</span>
                      </div>
                    )}
                  </div>

                  <div className="text-right">
                    <div className="font-bold text-slate-900 tabular-nums">₹{order.totalAmount}</div>
                    <button
                      onClick={() => handleOpenWhatsAppModal(order)}
                      className="text-[11px] text-indigo-600 hover:underline mt-0.5"
                    >
                      Resend Receipt
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* WhatsApp Invoice Simulator Modal */}
      {selectedOrderForInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden border border-slate-200 shadow-2xl relative">
            {/* WhatsApp Top Header */}
            <div className="bg-[#075e54] text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#25d366] text-white flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 fill-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">FoodDesk WhatsApp Invoice Bot</h3>
                  <div className="text-[11px] text-emerald-100">Official Restaurant Delivery API</div>
                </div>
              </div>
              <button
                onClick={() => setSelectedOrderForInvoice(null)}
                className="p-1 text-emerald-100 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Recipient Phone Number
                </label>
                <input
                  type="text"
                  value={customPhone}
                  onChange={(e) => setCustomPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono"
                />
              </div>

              {/* Message Preview Box */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Formatted Invoice Message
                </label>
                <div className="p-3 bg-[#e5ddd5]/30 border border-[#c8c1ba] rounded-xl text-xs font-mono text-slate-800 whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">
                  {formatWhatsAppMessage(selectedOrderForInvoice)}
                </div>
              </div>

              {whatsAppDeliveryStatus === 'delivered' ? (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Invoice sent successfully to customer&apos;s WhatsApp!</span>
                </div>
              ) : null}

              <div className="pt-2 flex flex-col gap-2">
                <button
                  onClick={handleSendWhatsApp}
                  disabled={whatsAppDeliveryStatus === 'sending'}
                  className="w-full py-2.5 bg-[#25d366] hover:bg-[#1ebd5a] text-white font-bold text-xs rounded-xl shadow-sm transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{whatsAppDeliveryStatus === 'sending' ? 'Sending via WhatsApp API...' : 'Send WhatsApp Invoice'}</span>
                </button>

                <a
                  href={`https://wa.me/${customPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                    formatWhatsAppMessage(selectedOrderForInvoice)
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-center py-2 text-xs text-slate-600 hover:text-slate-900 font-medium flex items-center justify-center gap-1"
                >
                  <span>Open directly in WhatsApp Web</span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print Bill Modal */}
      {selectedOrderForPrint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 border border-slate-200 shadow-2xl relative font-mono text-xs text-slate-800">
            <button
              onClick={() => setSelectedOrderForPrint(null)}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center pb-4 border-b border-dashed border-slate-300">
              <h3 className="text-sm font-bold tracking-wider">FOODDESK BISTRO & POS</h3>
              <div className="text-[10px] text-slate-500">MG Road, Bengaluru · GSTIN: 29AAAA0000A1Z5</div>
              <div className="text-[10px] text-slate-500 mt-1">Tax Invoice #{selectedOrderForPrint.orderNumber}</div>
            </div>

            <div className="py-3 border-b border-dashed border-slate-300 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span>Table:</span>
                <span>{selectedOrderForPrint.tableNumber || 'Takeaway'}</span>
              </div>
              <div className="flex justify-between">
                <span>Date:</span>
                <span>{new Date(selectedOrderForPrint.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Guest:</span>
                <span>{selectedOrderForPrint.customerName}</span>
              </div>
            </div>

            <div className="py-3 border-b border-dashed border-slate-300 space-y-1.5 text-[11px]">
              {selectedOrderForPrint.items.map((item) => (
                <div key={item.id} className="flex justify-between">
                  <span>
                    {item.quantity}× {item.name}
                  </span>
                  <span>₹{item.price * item.quantity}</span>
                </div>
              ))}
            </div>

            <div className="py-3 border-b border-dashed border-slate-300 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>₹{selectedOrderForPrint.totalAmount}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>GST (5%):</span>
                <span>₹{Math.round(selectedOrderForPrint.totalAmount * 0.05)}</span>
              </div>
              <div className="flex justify-between font-bold text-xs pt-1">
                <span>Total Amount:</span>
                <span>₹{selectedOrderForPrint.totalAmount + Math.round(selectedOrderForPrint.totalAmount * 0.05)}</span>
              </div>
            </div>

            <div className="text-center pt-3 text-[10px] text-slate-400">
              Thank you for visiting! Have a wonderful day.
            </div>

            <div className="mt-4 pt-3 flex gap-2">
              <button
                onClick={() => {
                  window.print();
                  setSelectedOrderForPrint(null);
                }}
                className="flex-1 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Thermal Slip</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

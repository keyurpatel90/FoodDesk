import React, { useState } from 'react';
import { TierConfig } from '@/lib/subscription-types';
import { razorpayService } from '@/lib/razorpay';
import { subscriptionService } from '@/lib/subscription';
import { ShieldCheck, CreditCard, Smartphone, Building, Wallet, CheckCircle2, X, Loader2, ArrowRight } from 'lucide-react';

interface RazorpayModalProps {
  tier: TierConfig;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (paymentId: string, orderId: string) => void;
}

export const RazorpayModal: React.FC<RazorpayModalProps> = ({
  tier,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [selectedMethod, setSelectedMethod] = useState<'upi' | 'card' | 'netbanking' | 'wallet'>('upi');
  const [upiId, setUpiId] = useState('restaurant@okhdfcbank');
  const [upiApp, setUpiApp] = useState<'gpay' | 'phonepe' | 'paytm' | 'qr'>('gpay');
  const [cardNumber, setCardNumber] = useState('4532 8921 4410 7823');
  const [cardExpiry, setCardExpiry] = useState('08/29');
  const [cardCvv, setCardCvv] = useState('883');
  const [cardHolder, setCardHolder] = useState('Keyur Patel');
  const [selectedBank, setSelectedBank] = useState('HDFC Bank');
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<'pay' | 'processing' | 'success'>('pay');
  const [successData, setSuccessData] = useState<{ paymentId: string; orderId: string } | null>(null);

  if (!isOpen) return null;

  const keyId = razorpayService.getKeyId();
  const orderDetails = razorpayService.generateMockOrder(tier.priceMonthly);

  const handlePayNow = () => {
    setIsProcessing(true);
    setStep('processing');

    setTimeout(() => {
      const mockSuccess = razorpayService.generateMockPaymentSuccess(orderDetails.orderId);
      setSuccessData({
        paymentId: mockSuccess.razorpay_payment_id,
        orderId: mockSuccess.razorpay_order_id,
      });

      // Activate subscription in service
      subscriptionService.activateTier(
        tier.id,
        mockSuccess.razorpay_payment_id,
        mockSuccess.razorpay_order_id,
        selectedMethod === 'upi'
          ? `Razorpay UPI (${upiApp.toUpperCase()})`
          : selectedMethod === 'card'
          ? 'Razorpay Credit Card (•••• 7823)'
          : `Razorpay Netbanking (${selectedBank})`
      );

      setStep('success');
      setIsProcessing(false);
    }, 1800);
  };

  const handleFinish = () => {
    if (successData) {
      onSuccess(successData.paymentId, successData.orderId);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-lg overflow-hidden bg-white rounded-2xl shadow-2xl border border-slate-200">
        {/* Razorpay Branded Top Header */}
        <div className="bg-[#0c2340] text-white p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#3395ff] flex items-center justify-center font-black text-white text-sm tracking-wider">
                R
              </div>
              <div>
                <div className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
                  Razorpay Trusted Business
                </div>
                <div className="text-base font-bold text-white tracking-tight">FoodDesk Restaurant POS</div>
              </div>
            </div>
            {step !== 'processing' && (
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="flex items-end justify-between pt-2 border-t border-slate-700/60">
            <div>
              <div className="text-xs text-slate-300">Plan Upgrade</div>
              <div className="text-sm font-medium text-slate-100">{tier.name} Plan (1 Month)</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-300">Amount Due</div>
              <div className="text-2xl font-bold text-white tabular-nums">₹{tier.priceMonthly.toLocaleString('en-IN')}</div>
            </div>
          </div>
        </div>

        {/* Step: Processing */}
        {step === 'processing' && (
          <div className="p-10 text-center flex flex-col items-center justify-center">
            <Loader2 className="w-12 h-12 text-[#3395ff] animate-spin mb-4" />
            <h3 className="text-lg font-bold text-slate-900 mb-1">Connecting to Razorpay Gateway</h3>
            <p className="text-sm text-slate-600 max-w-xs mb-4">
              Authorizing transaction securely with your banking partner...
            </p>
            <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-md border border-slate-200">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>256-bit SSL Encrypted & PCI-DSS Level 1</span>
            </div>
          </div>
        )}

        {/* Step: Success */}
        {step === 'success' && successData && (
          <div className="p-8 text-center flex flex-col items-center justify-center">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-1">Subscription Activated!</h3>
            <p className="text-sm text-slate-600 mb-6">
              Your restaurant dashboard has been upgraded to the <span className="font-semibold text-slate-900">{tier.name}</span> tier.
            </p>

            <div className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200 text-left text-xs space-y-2 mb-6">
              <div className="flex justify-between">
                <span className="text-slate-500">Razorpay Payment ID:</span>
                <span className="font-mono font-medium text-slate-800">{successData.paymentId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Order ID:</span>
                <span className="font-mono font-medium text-slate-800">{successData.orderId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Amount Paid:</span>
                <span className="font-semibold text-slate-900 tabular-nums">₹{tier.priceMonthly}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status:</span>
                <span className="font-semibold text-emerald-600">CAPTURED (Live)</span>
              </div>
            </div>

            <button
              onClick={handleFinish}
              className="w-full py-3 px-4 bg-[#0c2340] text-white rounded-xl font-semibold hover:bg-[#163b69] transition-colors flex items-center justify-center gap-2 text-sm shadow-sm"
            >
              <span>Go to Unlocked Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Step: Select & Pay */}
        {step === 'pay' && (
          <div className="p-6">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              Select Payment Method
            </div>

            {/* Payment Method Selector */}
            <div className="grid grid-cols-4 gap-2 mb-5">
              <button
                type="button"
                onClick={() => setSelectedMethod('upi')}
                className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 ${
                  selectedMethod === 'upi'
                    ? 'border-[#3395ff] bg-blue-50/50 text-[#0c2340] font-semibold ring-1 ring-[#3395ff]'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600 bg-white'
                }`}
              >
                <Smartphone className="w-5 h-5 text-[#3395ff]" />
                <span className="text-xs">UPI / QR</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedMethod('card')}
                className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 ${
                  selectedMethod === 'card'
                    ? 'border-[#3395ff] bg-blue-50/50 text-[#0c2340] font-semibold ring-1 ring-[#3395ff]'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600 bg-white'
                }`}
              >
                <CreditCard className="w-5 h-5 text-indigo-600" />
                <span className="text-xs">Cards</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedMethod('netbanking')}
                className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 ${
                  selectedMethod === 'netbanking'
                    ? 'border-[#3395ff] bg-blue-50/50 text-[#0c2340] font-semibold ring-1 ring-[#3395ff]'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600 bg-white'
                }`}
              >
                <Building className="w-5 h-5 text-amber-600" />
                <span className="text-xs">Netbanking</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedMethod('wallet')}
                className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 ${
                  selectedMethod === 'wallet'
                    ? 'border-[#3395ff] bg-blue-50/50 text-[#0c2340] font-semibold ring-1 ring-[#3395ff]'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600 bg-white'
                }`}
              >
                <Wallet className="w-5 h-5 text-purple-600" />
                <span className="text-xs">Wallets</span>
              </button>
            </div>

            {/* Method Details */}
            {selectedMethod === 'upi' && (
              <div className="space-y-4">
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'gpay', label: 'Google Pay' },
                    { id: 'phonepe', label: 'PhonePe' },
                    { id: 'paytm', label: 'Paytm' },
                    { id: 'qr', label: 'Scan QR' },
                  ].map((app) => (
                    <button
                      key={app.id}
                      type="button"
                      onClick={() => setUpiApp(app.id as typeof upiApp)}
                      className={`py-2 px-1 text-xs text-center rounded-lg border transition-all ${
                        upiApp === app.id
                          ? 'border-[#3395ff] bg-blue-50/60 font-semibold text-slate-900'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {app.label}
                    </button>
                  ))}
                </div>

                {upiApp === 'qr' ? (
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center flex flex-col items-center">
                    <div className="w-36 h-36 bg-white border border-slate-200 rounded-lg p-2 flex items-center justify-center shadow-xs mb-2">
                      <div className="w-full h-full bg-slate-900 flex items-center justify-center p-1 rounded">
                        <div className="w-full h-full grid grid-cols-5 gap-1 p-2 bg-white rounded">
                          {Array.from({ length: 25 }).map((_, i) => (
                            <div
                              key={i}
                              className={`rounded-xs ${
                                (i % 2 === 0 && i % 3 === 0) || i === 0 || i === 4 || i === 20
                                  ? 'bg-slate-900'
                                  : 'bg-slate-200'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-slate-600">Scan using any UPI app on phone</div>
                    <div className="text-xs font-mono text-slate-400 mt-0.5">UPI ID: fooddesk.rzp@hdfcbank</div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Enter UPI VPA / ID</label>
                    <input
                      type="text"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      placeholder="username@bank"
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#3395ff] text-slate-900"
                    />
                  </div>
                )}
              </div>
            )}

            {selectedMethod === 'card' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Card Number</label>
                  <input
                    type="text"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    placeholder="4532 •••• •••• 7823"
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#3395ff] text-slate-900"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Expiry (MM/YY)</label>
                    <input
                      type="text"
                      value={cardExpiry}
                      onChange={(e) => setCardExpiry(e.target.value)}
                      placeholder="MM/YY"
                      className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#3395ff] text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">CVV / CVC</label>
                    <input
                      type="password"
                      maxLength={4}
                      value={cardCvv}
                      onChange={(e) => setCardCvv(e.target.value)}
                      placeholder="•••"
                      className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#3395ff] text-slate-900"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Name on Card</label>
                  <input
                    type="text"
                    value={cardHolder}
                    onChange={(e) => setCardHolder(e.target.value)}
                    placeholder="Keyur Patel"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#3395ff] text-slate-900"
                  />
                </div>
              </div>
            )}

            {selectedMethod === 'netbanking' && (
              <div className="space-y-3">
                <label className="block text-xs font-medium text-slate-700 mb-1">Popular Banks</label>
                <div className="grid grid-cols-2 gap-2">
                  {['HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank', 'Kotak Mahindra', 'Punjab National Bank'].map((bank) => (
                    <button
                      key={bank}
                      type="button"
                      onClick={() => setSelectedBank(bank)}
                      className={`p-2 text-xs rounded-lg border text-left transition-all ${
                        selectedBank === bank
                          ? 'border-[#3395ff] bg-blue-50/60 font-semibold text-slate-900'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {bank}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedMethod === 'wallet' && (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Select Wallet</label>
                {['Paytm Wallet', 'Amazon Pay', 'PhonePe Wallet', 'Mobikwik'].map((wallet) => (
                  <div
                    key={wallet}
                    className="flex items-center justify-between p-3 border border-slate-200 rounded-xl hover:border-slate-300 cursor-pointer"
                  >
                    <span className="text-sm font-medium text-slate-800">{wallet}</span>
                    <span className="text-xs text-emerald-600 font-semibold">Available</span>
                  </div>
                ))}
              </div>
            )}

            {/* Pay Button */}
            <div className="mt-6 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={handlePayNow}
                disabled={isProcessing}
                className="w-full py-3 px-4 bg-[#3395ff] hover:bg-[#2082ec] text-white rounded-xl font-bold transition-all shadow-md flex items-center justify-center gap-2 text-sm cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Pay ₹{tier.priceMonthly.toLocaleString('en-IN')} via Razorpay</span>
              </button>

              <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400 mt-3">
                <span>Key ID: {keyId}</span>
                <span>·</span>
                <span>Instant Activation</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

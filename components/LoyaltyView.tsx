import React, { useState } from 'react';
import { LoyaltyCustomer, SubscriptionState } from '@/lib/subscription-types';
import { subscriptionService } from '@/lib/subscription';
import { Award, Lock, Sparkles, UserPlus, Gift, Search, ArrowRight } from 'lucide-react';

interface LoyaltyViewProps {
  loyaltyCustomers: LoyaltyCustomer[];
  setLoyaltyCustomers: React.Dispatch<React.SetStateAction<LoyaltyCustomer[]>>;
  subscription: SubscriptionState;
  onOpenPricing: () => void;
}

export const LoyaltyView: React.FC<LoyaltyViewProps> = ({
  loyaltyCustomers,
  setLoyaltyCustomers,
  subscription,
  onOpenPricing,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [redeemSuccess, setRedeemSuccess] = useState<string | null>(null);

  const hasLoyalty = subscriptionService.hasFeature('loyaltyProgram');

  // If locked in current plan
  if (!hasLoyalty) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 max-w-4xl mx-auto text-center space-y-6 shadow-2xs">
        <div className="w-14 h-14 rounded-2xl bg-violet-50 border border-violet-200 text-violet-600 flex items-center justify-center mx-auto">
          <Award className="w-7 h-7" />
        </div>

        <div className="max-w-md mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-100 text-violet-700 text-xs font-bold mb-3">
            <Lock className="w-3.5 h-3.5" />
            <span>Professional Plan Feature</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            Automated Customer Loyalty & Rewards
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Turn occasional diners into loyal regulars with reward points, Silver/Gold/Platinum tiers, automated birthday rewards, and instant bill discount redemptions.
          </p>
        </div>

        {/* Feature Preview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left pt-2">
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60">
            <div className="font-bold text-slate-900 text-xs mb-1">Points on Every Rupee</div>
            <p className="text-[11px] text-slate-500">
              Customers earn 1 point per ₹10 spent, credited automatically when bill settles.
            </p>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60">
            <div className="font-bold text-slate-900 text-xs mb-1">VIP Tier Badges</div>
            <p className="text-[11px] text-slate-500">
              Silver, Gold, and Platinum status unlocking complimentary desserts and priority tables.
            </p>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60">
            <div className="font-bold text-slate-900 text-xs mb-1">1-Click Redemption</div>
            <p className="text-[11px] text-slate-500">
              Cashier can apply ₹50 to ₹500 point discount with instant OTP confirmation.
            </p>
          </div>
        </div>

        <div className="pt-4">
          <button
            onClick={onOpenPricing}
            className="px-6 py-3 bg-[#6c5ce7] hover:bg-[#5b4cdb] text-white rounded-xl text-sm font-bold shadow-md transition-all inline-flex items-center gap-2 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Upgrade to Professional (₹799/mo)</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Active Loyalty Program
  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName || !newCustomerPhone) return;

    const newMember: LoyaltyCustomer = {
      id: `lc-${Date.now()}`,
      name: newCustomerName,
      phone: newCustomerPhone,
      points: 100, // 100 bonus joining points
      tier: 'Silver',
      totalSpent: 0,
      lastVisit: 'Today',
    };

    setLoyaltyCustomers((prev) => [newMember, ...prev]);
    setNewCustomerName('');
    setNewCustomerPhone('');
    setShowAddModal(false);
  };

  const handleRedeemPoints = (customer: LoyaltyCustomer) => {
    if (customer.points < 100) {
      alert('Minimum 100 points required to redeem a ₹100 discount coupon.');
      return;
    }
    setLoyaltyCustomers((prev) =>
      prev.map((c) => (c.id === customer.id ? { ...c, points: c.points - 100 } : c))
    );
    setRedeemSuccess(`🎉 Redeemed 100 points for ${customer.name}! ₹100 applied to next bill.`);
    setTimeout(() => setRedeemSuccess(null), 4000);
  };

  const filtered = loyaltyCustomers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">Customer Loyalty Rewards Program</h2>
            <span className="text-[10px] font-bold text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full">
              Professional Tier Active
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            1 point earned per ₹10 spent. Redeem 100 points = ₹100 bill discount.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search member or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 w-52"
            />
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Add Member</span>
          </button>
        </div>
      </div>

      {redeemSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold text-center animate-fade-in">
          {redeemSuccess}
        </div>
      )}

      {/* Member Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Member Name</th>
                <th className="py-3 px-4">Phone Number</th>
                <th className="py-3 px-4">VIP Tier</th>
                <th className="py-3 px-4 text-right">Points Balance</th>
                <th className="py-3 px-4 text-right">Total Spend</th>
                <th className="py-3 px-4">Last Visit</th>
                <th className="py-3 px-4 text-center">Reward Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filtered.map((customer) => (
                <tr key={customer.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 font-bold text-slate-900">{customer.name}</td>
                  <td className="py-3 px-4 font-mono text-slate-600">{customer.phone}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        customer.tier === 'Platinum'
                          ? 'bg-purple-100 text-purple-700 border border-purple-200'
                          : customer.tier === 'Gold'
                          ? 'bg-amber-100 text-amber-700 border border-amber-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {customer.tier}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-black text-slate-900 tabular-nums">
                    {customer.points} pts
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums">₹{customer.totalSpent.toLocaleString('en-IN')}</td>
                  <td className="py-3 px-4 text-slate-500">{customer.lastVisit}</td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => handleRedeemPoints(customer)}
                      className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1 mx-auto cursor-pointer"
                    >
                      <Gift className="w-3 h-3 text-amber-600" />
                      <span>Redeem ₹100 Off</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Member Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <form
            onSubmit={handleAddMember}
            className="bg-white rounded-2xl max-w-sm w-full p-6 border border-slate-200 shadow-xl space-y-4"
          >
            <h3 className="text-base font-bold text-slate-900">Enroll New Loyalty Member</h3>
            <p className="text-xs text-slate-500">
              New members receive 100 complimentary reward points upon registration.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Customer Full Name</label>
              <input
                type="text"
                required
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                placeholder="e.g. Rohini Sen"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Mobile Number</label>
              <input
                type="text"
                required
                value={newCustomerPhone}
                onChange={(e) => setNewCustomerPhone(e.target.value)}
                placeholder="+91 98765 12345"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700"
              >
                Save Member
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

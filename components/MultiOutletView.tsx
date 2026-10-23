import React, { useState } from 'react';
import { Outlet, SubscriptionState } from '@/lib/subscription-types';
import { subscriptionService } from '@/lib/subscription';
import { Building2, Lock, Sparkles, Plus, CheckCircle2, ArrowRight } from 'lucide-react';

interface MultiOutletViewProps {
  outlets: Outlet[];
  setOutlets: React.Dispatch<React.SetStateAction<Outlet[]>>;
  subscription: SubscriptionState;
  onOpenPricing: () => void;
}

export const MultiOutletView: React.FC<MultiOutletViewProps> = ({
  outlets,
  setOutlets,
  subscription,
  onOpenPricing,
}) => {
  const [activeOutletId, setActiveOutletId] = useState('out-1');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newOutletName, setNewOutletName] = useState('');
  const [newOutletLocation, setNewOutletLocation] = useState('');

  const hasMultiOutlet = subscriptionService.hasFeature('multiOutlet');

  if (!hasMultiOutlet) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 max-w-4xl mx-auto text-center space-y-6 shadow-2xs">
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
          <Building2 className="w-7 h-7" />
        </div>

        <div className="max-w-md mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold mb-3">
            <Lock className="w-3.5 h-3.5" />
            <span>Enterprise Tier Feature</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            Multi-Branch Restaurant Chain Management
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Manage your flagship bistros, express airport outlets, and cloud kitchen hubs from a single unified enterprise console with centralized menus and cross-branch analytics.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left pt-2">
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60">
            <div className="font-bold text-slate-900 text-xs mb-1">Centralized Menu Push</div>
            <p className="text-[11px] text-slate-500">
              Update pricing or recipes in headquarters and synchronize across all franchise outlets in seconds.
            </p>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60">
            <div className="font-bold text-slate-900 text-xs mb-1">Cross-Branch Settlement</div>
            <p className="text-[11px] text-slate-500">
              Compare sales velocity, average table spend, and kitchen efficiency across all locations.
            </p>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60">
            <div className="font-bold text-slate-900 text-xs mb-1">Dedicated Account Manager</div>
            <p className="text-[11px] text-slate-500">
              Personal POS architect assigned to your brand with 24/7 priority SLA and on-site training.
            </p>
          </div>
        </div>

        <div className="pt-4">
          <button
            onClick={onOpenPricing}
            className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-bold shadow-md transition-all inline-flex items-center gap-2 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span>Upgrade to Enterprise (₹1,199/mo)</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Active Enterprise Multi-Outlet
  const handleAddOutlet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOutletName) return;

    const newOutlet: Outlet = {
      id: `out-${Date.now()}`,
      name: newOutletName,
      location: newOutletLocation || 'Bengaluru City',
      phone: '+91 80 4999 8888',
      active: true,
    };

    setOutlets((prev) => [...prev, newOutlet]);
    setNewOutletName('');
    setNewOutletLocation('');
    setShowAddModal(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">Multi-Outlet Branch Management</h2>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
              Enterprise Active
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Switch between restaurant outlets or provision new franchise locations.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Provision New Branch</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {outlets.map((outlet) => {
          const isSelected = activeOutletId === outlet.id;
          return (
            <div
              key={outlet.id}
              onClick={() => setActiveOutletId(outlet.id)}
              className={`p-5 rounded-2xl border bg-white cursor-pointer transition-all ${
                isSelected
                  ? 'border-emerald-600 ring-2 ring-emerald-600/30 shadow-md'
                  : 'border-slate-200 hover:border-slate-300 shadow-2xs'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <Building2 className="w-5 h-5" />
                </div>
                {isSelected ? (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Active Console</span>
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400">Click to Switch</span>
                )}
              </div>

              <h3 className="text-sm font-bold text-slate-900">{outlet.name}</h3>
              <p className="text-xs text-slate-500 mt-1">{outlet.location}</p>
              <div className="text-[11px] text-slate-400 font-mono mt-0.5">{outlet.phone}</div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500">Live KDS Load</span>
                <span className="font-bold text-slate-800">Operational</span>
              </div>
            </div>
          );
        })}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <form
            onSubmit={handleAddOutlet}
            className="bg-white rounded-2xl max-w-sm w-full p-6 border border-slate-200 shadow-xl space-y-4"
          >
            <h3 className="text-base font-bold text-slate-900">Provision New Branch</h3>
            <p className="text-xs text-slate-500">
              Adds a new store location under your Enterprise FoodDesk master account.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Branch Name</label>
              <input
                type="text"
                required
                value={newOutletName}
                onChange={(e) => setNewOutletName(e.target.value)}
                placeholder="e.g. FoodDesk Indira Nagar Hub"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Address / Location</label>
              <input
                type="text"
                value={newOutletLocation}
                onChange={(e) => setNewOutletLocation(e.target.value)}
                placeholder="e.g. 100 Feet Road, HAL 2nd Stage"
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
                className="flex-1 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800"
              >
                Create Branch
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

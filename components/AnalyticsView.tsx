import React from 'react';
import { SubscriptionState } from '@/lib/subscription-types';
import { subscriptionService } from '@/lib/subscription';
import { BarChart3, TrendingUp, Clock, Flame, Users, Lock, Sparkles, ArrowRight } from 'lucide-react';

interface AnalyticsViewProps {
  subscription: SubscriptionState;
  onOpenPricing: () => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  subscription,
  onOpenPricing,
}) => {
  const hasAnalytics = subscriptionService.hasFeature('advancedAnalytics');

  // If locked in current plan
  if (!hasAnalytics) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 max-w-4xl mx-auto text-center space-y-6 shadow-2xs">
        <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center mx-auto">
          <BarChart3 className="w-7 h-7" />
        </div>

        <div className="max-w-md mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-100 text-violet-700 text-xs font-bold mb-3">
            <Lock className="w-3.5 h-3.5" />
            <span>Professional & Enterprise Feature</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            Advanced Restaurant Analytics Hub
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Gain data-driven intelligence on hourly mealtime rush patterns, top performing chef stations, menu item margins, and floor table turnaround times.
          </p>
        </div>

        {/* Feature Preview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left pt-2">
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60">
            <div className="font-bold text-slate-900 text-xs mb-1">Peak Hour Heatmaps</div>
            <p className="text-[11px] text-slate-500">
              Pinpoint lunch and dinner rush hours to optimize kitchen staffing and food prep.
            </p>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60">
            <div className="font-bold text-slate-900 text-xs mb-1">KDS Velocity Tracking</div>
            <p className="text-[11px] text-slate-500">
              Measure average ticket cook times and identify bottlenecks across hot/cold lines.
            </p>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60">
            <div className="font-bold text-slate-900 text-xs mb-1">Menu Margin Matrix</div>
            <p className="text-[11px] text-slate-500">
              Identify top selling dishes, highest margin beverages, and underperforming items.
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

  // Active Analytics View
  const hourlyData = [
    { hour: '11 AM', revenue: 1200, orders: 4, height: 20 },
    { hour: '12 PM', revenue: 3800, orders: 11, height: 50 },
    { hour: '1 PM', revenue: 6400, orders: 19, height: 85 },
    { hour: '2 PM', revenue: 4900, orders: 14, height: 65 },
    { hour: '3 PM', revenue: 2100, orders: 7, height: 30 },
    { hour: '4 PM', revenue: 1500, orders: 5, height: 22 },
    { hour: '5 PM', revenue: 2400, orders: 8, height: 35 },
    { hour: '6 PM', revenue: 3900, orders: 12, height: 55 },
    { hour: '7 PM', revenue: 7800, orders: 23, height: 95 },
    { hour: '8 PM', revenue: 9200, orders: 28, height: 100 },
    { hour: '9 PM', revenue: 8100, orders: 24, height: 88 },
    { hour: '10 PM', revenue: 4300, orders: 13, height: 58 },
  ];

  const topItems = [
    { name: 'Hyderabadi Dum Biryani', count: 48, revenue: 18240, share: '32%' },
    { name: 'Paneer Butter Masala', count: 36, revenue: 11520, share: '21%' },
    { name: 'Classic Margherita Pizza', count: 29, revenue: 10440, share: '18%' },
    { name: 'Truffle Parmesan Fries', count: 42, revenue: 7980, share: '14%' },
    { name: 'Cold Brew Iced Latte', count: 31, revenue: 4960, share: '9%' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">Advanced Analytics Hub</h2>
            <span className="text-[10px] font-bold text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full">
              Live Real-Time Data
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Operational KPIs, peak kitchen rush velocity, and menu profitability.
          </p>
        </div>

        <div className="text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
          Showing: <span className="font-semibold text-slate-800">Today&apos;s Lunch & Dinner Cycles</span>
        </div>
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span>Today&apos;s Gross Sales</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 tabular-nums">₹55,640</div>
          <div className="text-[11px] text-emerald-600 font-semibold mt-1">+16.4% vs last Monday</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span>Avg Order Value (AOV)</span>
            <Users className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 tabular-nums">₹624</div>
          <div className="text-[11px] text-slate-500 mt-1">Across 89 dine-in bills</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span>Average Ticket Cook Time</span>
            <Clock className="w-4 h-4 text-orange-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 tabular-nums">13.2m</div>
          <div className="text-[11px] text-emerald-600 font-semibold mt-1">2.1m faster than target</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span>Kitchen Ticket Load</span>
            <Flame className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 tabular-nums">14 Active</div>
          <div className="text-[11px] text-slate-500 mt-1">8 hot station · 6 grill/bakery</div>
        </div>
      </div>

      {/* Hourly Sales Bar Chart */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Hourly Revenue & Mealtime Rush</h3>
            <p className="text-xs text-slate-500">Identifies peak hours for table seating and kitchen expedite</p>
          </div>
          <div className="text-xs text-slate-500">
            Peak Rush: <span className="font-bold text-indigo-600">8:00 PM – 9:00 PM</span>
          </div>
        </div>

        <div className="h-48 flex items-end gap-2 sm:gap-4 pt-6 border-b border-slate-200 pb-2">
          {hourlyData.map((d) => (
            <div key={d.hour} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
              <div className="text-[10px] text-slate-500 font-mono opacity-0 group-hover:opacity-100 transition-opacity tabular-nums">
                ₹{d.revenue}
              </div>
              <div
                style={{ height: `${d.height}%` }}
                className={`w-full rounded-t-md transition-all ${
                  d.height > 80
                    ? 'bg-indigo-600 group-hover:bg-indigo-700'
                    : d.height > 50
                    ? 'bg-indigo-400 group-hover:bg-indigo-500'
                    : 'bg-indigo-200 group-hover:bg-indigo-300'
                }`}
              />
              <span className="text-[10px] text-slate-500 font-medium whitespace-nowrap">{d.hour}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top Dishes Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden p-5">
        <h3 className="text-sm font-bold text-slate-900 mb-4">Top 5 Revenue Generating Dishes</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
              <tr>
                <th className="py-2.5 px-3">Item Name</th>
                <th className="py-2.5 px-3 text-right">Orders Count</th>
                <th className="py-2.5 px-3 text-right">Total Revenue</th>
                <th className="py-2.5 px-3 text-right">Category Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {topItems.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="py-2.5 px-3 font-semibold text-slate-900">{item.name}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums font-mono">{item.count} sold</td>
                  <td className="py-2.5 px-3 text-right tabular-nums font-bold text-slate-900">
                    ₹{item.revenue.toLocaleString('en-IN')}
                  </td>
                  <td className="py-2.5 px-3 text-right text-indigo-600 font-semibold">{item.share}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

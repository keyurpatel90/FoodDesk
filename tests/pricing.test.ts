import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { quoteChange, isRunning, effectiveEnd, OrgSubscriptionRow, DAY_MS } from '../lib/server/pricing';

const now = new Date('2026-10-20T10:00:00Z');
const inDays = (d: number) => new Date(now.getTime() + d * DAY_MS).toISOString();
const row = (o: Partial<OrgSubscriptionRow>): OrgSubscriptionRow => ({
  tier: 'professional', status: 'active', subscriptionEndDate: inDays(30), trialEndsAt: null, ...o,
});

describe('quoteChange', () => {
  it('expired plan: any tier is a new purchase at full price', () => {
    for (const tier of ['starter', 'professional', 'enterprise'] as const) {
      const q = quoteChange(row({ status: 'inactive', subscriptionEndDate: inDays(-3) }), tier, now);
      assert.equal(q.kind, 'new');
      assert.equal(q.creditPaise, 0);
    }
    assert.equal(quoteChange(row({ status: 'inactive', subscriptionEndDate: inDays(-3) }), 'professional', now).amountPaise, 79900);
  });

  it('active status but end date in the past counts as expired', () => {
    assert.equal(quoteChange(row({ subscriptionEndDate: inDays(-1) }), 'starter', now).kind, 'new');
  });

  it('trial: buying any plan is a full-price new purchase (trial days are not credited)', () => {
    const trial = row({ status: 'trial', trialEndsAt: inDays(9), subscriptionEndDate: inDays(9) });
    const q = quoteChange(trial, 'enterprise', now);
    assert.equal(q.kind, 'new');
    assert.equal(q.amountPaise, 119900);
    assert.equal(quoteChange(trial, 'starter', now).kind, 'new'); // downgrade from trial is fine
  });

  it('renew same plan: full price', () => {
    const q = quoteChange(row({ subscriptionEndDate: inDays(3) }), 'professional', now);
    assert.equal(q.kind, 'renew');
    assert.equal(q.amountPaise, 79900);
  });

  it('upgrade credits unused days (15 of 30 days left on Pro -> Enterprise)', () => {
    const q = quoteChange(row({ subscriptionEndDate: inDays(15) }), 'enterprise', now);
    assert.equal(q.kind, 'upgrade');
    assert.equal(q.creditPaise, Math.floor((79900 * 15) / 30)); // 39950
    assert.equal(q.amountPaise, 119900 - 39950);
  });

  it('upgrade credit is capped at one period even with stacked renewals', () => {
    const q = quoteChange(row({ subscriptionEndDate: inDays(75) }), 'enterprise', now);
    assert.equal(q.creditPaise, 79900);
    assert.equal(q.amountPaise, 40000);
  });

  it('upgrade on the last second still charges at least Rs 1 and never goes negative', () => {
    const q = quoteChange(row({ tier: 'starter', subscriptionEndDate: inDays(30) }), 'professional', now);
    assert.equal(q.amountPaise, 79900 - 30000);
    assert.ok(q.amountPaise >= 100);
  });

  it('downgrade while a paid plan is running is blocked with a helpful reason', () => {
    const q = quoteChange(row({ tier: 'enterprise', subscriptionEndDate: inDays(10) }), 'starter', now);
    assert.equal(q.kind, 'blocked_downgrade');
    assert.match(q.blockedReason!, /Enterprise plan is active until/);
    assert.match(q.blockedReason!, /switch to Starter/);
  });

  it('downgrade is allowed once the plan has expired', () => {
    const q = quoteChange(row({ tier: 'enterprise', status: 'inactive', subscriptionEndDate: inDays(-1) }), 'starter', now);
    assert.equal(q.kind, 'new');
    assert.equal(q.amountPaise, 30000);
  });
});

describe('isRunning / effectiveEnd', () => {
  it('trial uses trial_ends_at, paid uses subscription_end_date', () => {
    const t = row({ status: 'trial', trialEndsAt: inDays(5), subscriptionEndDate: inDays(30) });
    assert.equal(effectiveEnd(t)!.toISOString(), inDays(5));
    assert.equal(isRunning(t, now), true);
    assert.equal(isRunning(row({ status: 'trial', trialEndsAt: inDays(-1), subscriptionEndDate: inDays(30) }), now), false);
  });
  it('canceled / past_due / inactive never run; missing dates never run', () => {
    for (const status of ['canceled', 'past_due', 'inactive'] as const) assert.equal(isRunning(row({ status }), now), false);
    assert.equal(isRunning(row({ subscriptionEndDate: null }), now), false);
  });
});

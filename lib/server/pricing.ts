import { SUBSCRIPTION_TIERS } from '@/lib/subscription-data';
import type { PlanChangeKind, SubscriptionTierId } from '@/lib/subscription-types';

/**
 * Pure pricing rules (no I/O) so they can be unit-tested.
 * All money is in paise (₹1 = 100 paise) to avoid floating point errors.
 */

export const PERIOD_DAYS = 30;
export const TRIAL_DAYS = 14;
export const DAY_MS = 24 * 60 * 60 * 1000;
/** Razorpay rejects orders below ₹1. */
export const MIN_CHARGE_PAISE = 100;

export const TIER_RANK: Record<SubscriptionTierId, number> = { starter: 1, professional: 2, enterprise: 3 };
export const TIER_IDS = Object.keys(TIER_RANK) as SubscriptionTierId[];

export type DbSubscriptionStatus = 'active' | 'trial' | 'inactive' | 'past_due' | 'canceled';

/** The few organizations columns the billing rules care about. */
export interface OrgSubscriptionRow {
  tier: SubscriptionTierId;
  status: DbSubscriptionStatus;
  subscriptionEndDate: string | null;
  trialEndsAt: string | null;
}

export interface Quote {
  kind: PlanChangeKind;
  tierId: SubscriptionTierId;
  listPricePaise: number;
  creditPaise: number;
  amountPaise: number;
  /** Set only when kind === 'blocked_downgrade' */
  blockedReason?: string;
}

export const listPricePaise = (tier: SubscriptionTierId): number =>
  Math.round(SUBSCRIPTION_TIERS[tier].priceMonthly * 100);

export function isTierId(value: unknown): value is SubscriptionTierId {
  return typeof value === 'string' && (TIER_IDS as string[]).includes(value);
}

/** Trials expire on trial_ends_at; paid plans on subscription_end_date. */
export function effectiveEnd(row: OrgSubscriptionRow): Date | null {
  const raw = row.status === 'trial' ? row.trialEndsAt ?? row.subscriptionEndDate : row.subscriptionEndDate;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** True while the restaurant is allowed to operate (paid period or trial still running). */
export function isRunning(row: OrgSubscriptionRow, now: Date = new Date()): boolean {
  if (row.status !== 'active' && row.status !== 'trial') return false;
  const end = effectiveEnd(row);
  return !!end && end.getTime() > now.getTime();
}

const fmtDate = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * What does buying `target` mean right now, and what should it cost?
 *
 *  - not running / on trial    -> 'new'      full price, starts today
 *  - running paid, same tier   -> 'renew'    full price, 30 days are ADDED after the current end date
 *  - running paid, higher tier -> 'upgrade'  full price minus credit for unused days (max 30), starts today
 *  - running paid, lower tier  -> 'blocked_downgrade' (switch after the current period ends)
 */
export function quoteChange(row: OrgSubscriptionRow, target: SubscriptionTierId, now: Date = new Date()): Quote {
  const list = listPricePaise(target);
  const base = { tierId: target, listPricePaise: list };

  const paidAndRunning = row.status === 'active' && isRunning(row, now);
  if (!paidAndRunning) {
    return { ...base, kind: 'new', creditPaise: 0, amountPaise: list };
  }

  if (target === row.tier) {
    return { ...base, kind: 'renew', creditPaise: 0, amountPaise: list };
  }

  if (TIER_RANK[target] < TIER_RANK[row.tier]) {
    const end = effectiveEnd(row)!;
    return {
      ...base,
      kind: 'blocked_downgrade',
      creditPaise: 0,
      amountPaise: list,
      blockedReason: `Your ${SUBSCRIPTION_TIERS[row.tier].name} plan is active until ${fmtDate(end)}. You can switch to ${SUBSCRIPTION_TIERS[target].name} after that.`,
    };
  }

  // Upgrade: credit the unused part of the current plan (capped at one period so the credit can never exceed its price).
  const remainingMs = Math.min(Math.max(effectiveEnd(row)!.getTime() - now.getTime(), 0), PERIOD_DAYS * DAY_MS);
  const credit = Math.floor((listPricePaise(row.tier) * remainingMs) / (PERIOD_DAYS * DAY_MS));
  const amount = Math.max(list - credit, MIN_CHARGE_PAISE);
  return { ...base, kind: 'upgrade', creditPaise: list - amount, amountPaise: amount };
}

import type { Role } from '@/lib/types';
import { canonicalRole } from '@/lib/types';
import { subscriptionService } from '@/lib/subscription';

export type Permission =
  | 'pos'
  | 'orders'
  | 'kitchen'
  | 'reports'
  | 'inventory'
  | 'staff'
  | 'settings'
  | 'runner';

const permissions: Record<Exclude<Role, 'admin' | 'treasurer'>, Permission[]> = {
  owner: ['pos', 'orders', 'kitchen', 'reports', 'inventory', 'staff', 'settings', 'runner'],
  manager: ['pos', 'orders', 'kitchen', 'reports', 'inventory', 'runner'],
  cashier: ['pos', 'orders'],
  kitchen: ['kitchen'],
  runner: ['runner'],
  viewer: ['reports'],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return permissions[canonicalRole(role)].includes(permission);
}

export function canRolePerformAction(role: string, action: string): boolean {
  // 1. If organization subscription is inactive or expired, restrict operations
  const access = subscriptionService.canRoleAccessApp(role as any);
  if (!access.allowed) {
    return false;
  }

  // 2. Feature gate checking
  if (action === 'whatsapp_invoices') {
    return subscriptionService.hasFeature('whatsappInvoices'); // Unlocked on Professional & Enterprise
  }
  if (action === 'advanced_analytics') {
    return subscriptionService.hasFeature('advancedAnalytics'); // Unlocked on Professional & Enterprise
  }
  if (action === 'multi_outlet') {
    return subscriptionService.hasFeature('multiOutlet');       // Unlocked on Enterprise
  }

  return true;
}

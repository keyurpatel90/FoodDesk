import type { Role } from '@/lib/types';
import { canonicalRole } from '@/lib/types';

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

import type { Order } from '@/lib/types';
import { saveLocalOrder, getLocalOrders } from '@/lib/offline';

export function normalizedRemoteOrder(order: Order): Order {
  return {
    ...order,
    syncStatus: 'SYNCED',
    serverId: order.id,
    items: (order.items ?? []).map(item => ({ ...item, serverId: item.id })),
  };
}

export async function cacheRemoteOrders(orders: Order[]): Promise<void> {
  for (const order of orders) await saveLocalOrder(normalizedRemoteOrder(order));
}

export function mergeOrders(remote: Order[], local: Order[]): Order[] {
  const remoteIds = new Set(remote.map(order => order.id));
  const unsynced = local.filter(order => {
    if (order.syncStatus === 'SYNCED' && (order.serverId || remoteIds.has(order.id))) return false;
    return order.syncStatus !== 'SYNCED';
  });
  return [...remote.map(normalizedRemoteOrder), ...unsynced]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function getLocalOperationalOrders(): Promise<Order[]> {
  return getLocalOrders();
}

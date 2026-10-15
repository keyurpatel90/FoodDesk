import { supabase } from '@/lib/supabase';
import { getLocalOrders, saveLocalOrder } from '@/lib/offline';
import { mergeOrders, normalizedRemoteOrder } from '@/lib/order-merge';
import type { Order, OrderItem } from '@/lib/types';

export async function loadOrdersWithItems(statuses?: Order['status'][], station?: OrderItem['station'], limit = 100): Promise<Order[]> {
  try {
    let query = supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(limit);
    if (statuses?.length) query = query.in('status', statuses) as typeof query;
    const { data, error } = await query;
    if (error) throw error;
    const remote = (data ?? []) as Order[];
    const ids = remote.map(order => order.id);
    const { data: items, error: itemError } = ids.length
      ? await supabase.from('order_items').select('*').in('order_id', ids)
      : { data: [], error: null };
    if (itemError) throw itemError;
    const withItems = remote.map(order => ({
      ...order,
      items: (items ?? []).filter((item: { order_id: string }) => item.order_id === order.id),
    })) as Order[];
    await Promise.all(withItems.map(order => saveLocalOrder(normalizedRemoteOrder(order))));
    const local = await getLocalOrders();
    const merged = mergeOrders(withItems, local);
    return station ? merged.filter(order => order.items.some(item => item.station === station && item.status !== 'cancelled')) : merged;
  } catch {
    const local = await getLocalOrders();
    return local.filter(order => !statuses?.length || statuses.includes(order.status)).filter(order => !station || order.items.some(item => item.station === station && item.status !== 'cancelled')).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, limit);
  }
}

export function orderDisplayNo(order: Order): string {
  return order.order_no < 0 ? `LOCAL-${Math.abs(order.order_no)}` : `${order.order_no}`;
}

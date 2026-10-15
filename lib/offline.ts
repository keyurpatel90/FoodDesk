import { supabase } from '@/lib/supabase';
import type { AppSettings, Discount, Order, OrderItem, Profile, Product, SyncStatus } from '@/lib/types';

const DB_NAME = 'fooddesk-offline';
const DB_VERSION = 1;
const STORES = ['meta', 'orders', 'queue', 'products', 'discounts', 'profiles', 'settings'] as const;
type StoreName = typeof STORES[number];

type QueueAction = {
  id: string;
  type: 'create_order' | 'cancel_order' | 'cancel_order_item' | 'start_order' | 'complete_order_item' | 'deliver_order';
  localId: string;
  payload: Record<string, unknown>;
  attempts: number;
  nextAttemptAt: number;
  status: SyncStatus;
  lastError?: string;
  createdAt: string;
};

let opening: Promise<IDBDatabase> | null = null;

function canUseIndexedDb(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

function uuid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `fd-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function openDb(): Promise<IDBDatabase> {
  if (!canUseIndexedDb()) return Promise.reject(new Error('IndexedDB unavailable'));
  if (opening) return opening;
  const promise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open offline database'));
  });
  opening = promise.catch(error => {
    opening = null;
    throw error;
  });
  return opening;
}

async function put(store: StoreName, key: IDBValidKey, value: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Offline database write failed'));
  });
}

async function get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error ?? new Error('Offline database read failed'));
  });
}

async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  return new Promise<T[]>((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve((req.result ?? []) as T[]);
    req.onerror = () => reject(req.error ?? new Error('Offline database read failed'));
  });
}

async function remove(store: StoreName, key: IDBValidKey): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Offline database delete failed'));
  });
}

export async function getDeviceId(): Promise<string> {
  const existing = await get<string>('meta', 'deviceId');
  if (existing) return existing;
  const id = uuid();
  await put('meta', 'deviceId', id);
  return id;
}

export async function cacheSnapshot(data: { products?: Product[]; discounts?: Discount[]; profile?: Profile; settings?: AppSettings }): Promise<void> {
  if (data.products) await put('products', 'active', data.products);
  if (data.discounts) await put('discounts', 'active', data.discounts);
  if (data.profile) await put('profiles', 'current', data.profile);
  if (data.settings) await put('settings', 'current', data.settings);
}

export async function getCachedProducts(): Promise<Product[]> { return (await get<Product[]>('products', 'active')) ?? []; }
export async function getCachedDiscounts(): Promise<Discount[]> { return (await get<Discount[]>('discounts', 'active')) ?? []; }
export async function getCachedProfile(): Promise<Profile | undefined> { return get<Profile>('profiles', 'current'); }
export async function getCachedSettings(): Promise<AppSettings | undefined> { return get<AppSettings>('settings', 'current'); }

export async function saveLocalOrder(order: Order): Promise<void> { await put('orders', order.localId ?? order.id, order); }
export async function getLocalOrders(): Promise<Order[]> { return getAll<Order>('orders'); }
export async function getLocalOrder(localId: string): Promise<Order | undefined> { return get<Order>('orders', localId); }

export async function enqueue(action: Omit<QueueAction, 'id' | 'attempts' | 'nextAttemptAt' | 'status' | 'createdAt'>): Promise<void> {
  const entry: QueueAction = { ...action, id: uuid(), attempts: 0, nextAttemptAt: Date.now(), status: 'PENDING', createdAt: new Date().toISOString() };
  await put('queue', entry.id, entry);
}

export async function getQueue(): Promise<QueueAction[]> {
  const rows = await getAll<QueueAction>('queue');
  return rows.filter(x => x.status !== 'SYNCED').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getSyncStatuses(): Promise<SyncStatus[]> {
  const [orders, queue] = await Promise.all([getLocalOrders(), getQueue()]);
  return [...orders.map(x => x.syncStatus ?? 'SYNCED'), ...queue.map(x => x.status)];
}

export async function updateQueue(entry: QueueAction): Promise<void> { await put('queue', entry.id, entry); }
export async function deleteQueue(id: string): Promise<void> { await remove('queue', id); }

function broadcast(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('fooddesk-sync'));
}

async function patchLocalOrder(localId: string, patch: Partial<Order>): Promise<Order | undefined> {
  const order = await getLocalOrder(localId);
  if (!order) return undefined;
  const next = { ...order, ...patch, updated_at: new Date().toISOString() };
  await saveLocalOrder(next);
  broadcast();
  return next;
}

export async function markLocalOrderSynced(localId: string, remote: Order, remoteItems: OrderItem[]): Promise<void> {
  const local = await getLocalOrder(localId);
  const itemMap = new Map(remoteItems.map(item => [item.product_id, item]));
  const localItems = (local?.items ?? []).map(item => {
    const remoteItem = itemMap.get(item.product_id);
    return remoteItem ? { ...item, serverId: remoteItem.id, price: remoteItem.price, food_cost: remoteItem.food_cost } : item;
  });
  await patchLocalOrder(localId, {
    ...remote,
    id: remote.id,
    localId,
    serverId: remote.id,
    client_order_id: localId,
    syncStatus: 'SYNCED',
    syncError: null,
    items: localItems,
  });
}

export async function markLocalOrderFailed(localId: string, error: string): Promise<void> {
  await patchLocalOrder(localId, { syncStatus: 'FAILED', syncError: error });
}

export async function updateLocalItem(localId: string, itemId: string, patch: Partial<OrderItem>): Promise<Order | undefined> {
  const order = await getLocalOrder(localId);
  if (!order) return undefined;
  const items = order.items.map(item => item.id === itemId ? { ...item, ...patch } : item);
  const activeItems = items.filter(item => item.status !== 'cancelled');
  const nextStatus: Order['status'] = activeItems.length === 0
    ? 'cancelled'
    : activeItems.every(item => item.status === 'done')
      ? 'ready'
      : activeItems.some(item => item.status === 'done')
        ? 'preparing'
        : order.status === 'new' ? 'new' : 'preparing';
  const next = { ...order, items, status: nextStatus, syncStatus: 'PENDING' as SyncStatus, syncError: null, updated_at: new Date().toISOString(), version: (order.version ?? 1) + 1 };
  await saveLocalOrder(next);
  broadcast();
  return next;
}

export async function updateLocalOrderStatus(localId: string, status: Order['status']): Promise<Order | undefined> {
  const order = await getLocalOrder(localId);
  if (!order) return undefined;
  return patchLocalOrder(localId, { status, syncStatus: 'PENDING', syncError: null, version: (order.version ?? 1) + 1 });
}

export async function syncNow(): Promise<{ synced: number; failed: number }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { synced: 0, failed: 0 };
  const queue = await getQueue();
  if (!queue.length) return { synced: 0, failed: 0 };
  const deviceId = await getDeviceId();
  let synced = 0;
  let failed = 0;

  for (const entry of queue) {
    if (entry.nextAttemptAt > Date.now()) continue;
    entry.status = 'SYNCING';
    await updateQueue(entry);
    try {
      const local = await getLocalOrder(entry.localId);
      if (!local) throw new Error('Local order no longer exists');

      if (entry.type === 'create_order') {
        const payload = entry.payload;
        const { data, error } = await supabase.rpc('place_order', {
          p_payment_method: payload.payment_method,
          p_items: payload.items,
          p_covers: payload.covers,
          p_notes: payload.notes,
          p_discount_id: payload.discount_id,
          p_custom_discount_type: payload.custom_discount_type,
          p_custom_discount_value: payload.custom_discount_value,
          p_cash_received: payload.cash_received,
          p_token_no: payload.token_no,
          p_client_order_id: entry.localId,
          p_device_id: deviceId,
        });
        if (error) throw error;
        const remote = (Array.isArray(data) ? data[0] : data) as Order;
        const { data: remoteItems, error: itemError } = await supabase.from('order_items').select('*').eq('order_id', remote.id);
        if (itemError) throw itemError;
        await markLocalOrderSynced(entry.localId, remote, (remoteItems ?? []) as OrderItem[]);
      } else if (entry.type === 'cancel_order') {
        const serverId = local.serverId ?? (local.syncStatus === 'SYNCED' ? local.id : null);
        if (!serverId) throw new Error('Order is waiting for its create synchronization');
        const { error } = await supabase.rpc('cancel_order', { p_order_id: serverId, p_reason: entry.payload.reason ?? null });
        if (error) throw error;
        await patchLocalOrder(entry.localId, { status: 'cancelled', syncStatus: 'SYNCED' });
      } else if (entry.type === 'cancel_order_item') {
        const localItem = local.items.find(item => item.id === String(entry.payload.local_item_id ?? ''));
        const itemId = localItem?.serverId ?? String(entry.payload.server_item_id ?? '');
        if (!itemId) throw new Error('Order item is waiting for create synchronization');
        const { error } = await supabase.rpc('cancel_order_item', { p_item_id: itemId, p_reason: entry.payload.reason ?? null });
        if (error) throw error;
        await patchLocalOrder(entry.localId, { syncStatus: 'SYNCED' });
      } else if (entry.type === 'start_order') {
        const orderId = local.serverId ?? (local.syncStatus === 'SYNCED' ? local.id : null);
        if (!orderId) throw new Error('Order is waiting for create synchronization');
        const { error } = await supabase.rpc('start_order', { p_order_id: orderId });
        if (error) throw error;
        await patchLocalOrder(entry.localId, { status: 'preparing', syncStatus: 'SYNCED' });
      } else if (entry.type === 'complete_order_item') {
        const localItem = local.items.find(item => item.id === String(entry.payload.local_item_id ?? ''));
        const itemId = localItem?.serverId ?? String(entry.payload.server_item_id ?? '');
        if (!itemId) throw new Error('Order item is waiting for create synchronization');
        const { error } = await supabase.rpc('complete_order_item', { p_item_id: itemId });
        if (error) throw error;
        await patchLocalOrder(entry.localId, { syncStatus: 'SYNCED' });
      } else {
        const orderId = local.serverId ?? (local.syncStatus === 'SYNCED' ? local.id : null);
        if (!orderId) throw new Error('Order is waiting for create synchronization');
        const { error } = await supabase.rpc('deliver_order', { p_order_id: orderId });
        if (error) throw error;
        await patchLocalOrder(entry.localId, { status: 'delivered', syncStatus: 'SYNCED' });
      }
      await deleteQueue(entry.id);
      synced += 1;
    } catch (error) {
      entry.status = 'FAILED';
      entry.attempts += 1;
      entry.lastError = error instanceof Error ? error.message : 'Synchronization failed';
      entry.nextAttemptAt = Date.now() + Math.min(60000, 1000 * (2 ** Math.min(entry.attempts, 6)));
      await updateQueue(entry);
      await markLocalOrderFailed(entry.localId, entry.lastError);
      failed += 1;
    }
  }
  broadcast();
  return { synced, failed };
}

export function installSyncListeners(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = () => { void syncNow(); };
  window.addEventListener('online', handler);
  return () => window.removeEventListener('online', handler);
}

export function syncLabel(statuses: SyncStatus[]): 'OFFLINE' | 'SYNCING' | 'ALL DATA SYNCED ✓' {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'OFFLINE';
  if (statuses.some(s => s !== 'SYNCED')) return 'SYNCING';
  return 'ALL DATA SYNCED ✓';
}

export async function queueCount(): Promise<number> {
  const queue = await getQueue();
  return queue.filter(
    entry => entry.status === 'PENDING' || entry.status === 'FAILED'
  ).length;
}

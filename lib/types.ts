export type Station = 'waffle' | 'chole' | 'pav';
export type Role = 'admin' | 'manager' | 'cashier' | 'kitchen' | 'treasurer';
export type PaymentMethod = 'cash' | 'upi' | 'pos';
export type DiscountType = 'percent' | 'fixed';

export type Product = {
  id: string;
  name: string;
  price: number;
  station: Station;
  category?: string | null;
  active: boolean;
  sort_order: number;
  created_at?: string;
};

export type Discount = {
  id: string;
  name: string;
  type: DiscountType;
  value: number;
  active: boolean;
  min_order_amount: number;
  max_discount_amount: number | null;
  created_at?: string;
};

export type CartItem = { product: Product; qty: number };

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  station: Station;
  qty: number;
  price: number;
  status: 'new' | 'done' | 'cancelled';
  cancel_reason?: string | null;
};

export type Order = {
  id: string;
  order_no: number;
  service_day: string;
  status: 'new' | 'preparing' | 'ready' | 'cancelled';
  subtotal: number;
  discount_amount: number;
  discount_name?: string | null;
  discount_type?: DiscountType | null;
  discount_value?: number | null;
  total: number;
  payment_method: PaymentMethod;
  covers: number;
  token_no?: string | null;
  notes?: string | null;
  cash_received?: number | null;
  change_due?: number | null;
  created_by?: string | null;
  created_at: string;
  items: OrderItem[];
};

export type Profile = {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  active: boolean;
  created_at: string;
};

export type FeatureFlags = {
  cashier: boolean;
  kitchen: boolean;
  dashboard: boolean;
  orders: boolean;
  menuManagement: boolean;
  discounts: boolean;
  staffManagement: boolean;
  reports: boolean;
  printing: boolean;
  customDiscount: boolean;
  cashChange: boolean;
  upiPayment: boolean;
  posPayment: boolean;
};

export type AppSettings = {
  id: number;
  event_name: string;
  currency_symbol: string;
  service_day_cutoff_hour: number;
  kitchen_delay_minutes: number;
  max_custom_discount_percent: number;
  require_cash_received: boolean;
  features: FeatureFlags;
};

export const DEFAULT_FEATURES: FeatureFlags = {
  cashier: true,
  kitchen: true,
  dashboard: true,
  orders: true,
  menuManagement: true,
  discounts: true,
  staffManagement: true,
  reports: true,
  printing: true,
  customDiscount: true,
  cashChange: true,
  upiPayment: true,
  posPayment: true,
};

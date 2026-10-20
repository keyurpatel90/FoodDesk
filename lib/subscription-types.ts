export type SubscriptionTierId = 'starter' | 'professional' | 'enterprise';
export type SubscriptionStatus = 'active' | 'inactive' | 'trial';

export type UserRole = 'admin' | 'cashier' | 'waiter' | 'kitchen' | 'runner' | 'customer';

export interface TierConfig {
  id: SubscriptionTierId;
  name: string;
  tagline: string;
  priceMonthly: number;
  highlighted?: boolean;
  badge?: string;
  ctaText: string;
  limits: {
    maxTables: number; // 10, 30, Infinity
    maxStaff: number;  // 5, 15, Infinity
    kdsAudioAlerts: boolean;
    whatsappInvoices: boolean;
    loyaltyProgram: boolean;
    advancedAnalytics: boolean;
    multiOutlet: boolean;
    whiteLabel: boolean;
    multiStationKDS: boolean;
  };
  features: string[];
}

export interface SubscriptionState {
  tier: SubscriptionTierId;
  status: SubscriptionStatus;
  planName: string;
  amount: number;
  startDate: string;
  expiryDate: string;
  isTrial: boolean;
  trialDaysRemaining?: number;
  autoRenew: boolean;
  razorpayPaymentId?: string;
  razorpayOrderId?: string;
}

export interface PaymentInvoice {
  id: string;
  paymentId: string;
  orderId: string;
  tierId: SubscriptionTierId;
  tierName: string;
  amount: number;
  date: string;
  status: 'captured' | 'failed' | 'refunded';
  method: string;
  receiptNumber: string;
}

export type OrderStatus = 'new' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
export type KitchenStation = 'hot' | 'cold' | 'beverage' | 'bakery';

export interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  station: KitchenStation;
  notes?: string;
  isPrepared?: boolean;
}

export interface Order {
  id: string;
  orderNumber: string;
  tableNumber: number;
  outletId: string;
  type: 'dine-in' | 'takeaway' | 'delivery';
  items: OrderItem[];
  status: OrderStatus;
  createdAt: string;
  placedByRole: UserRole;
  placedByName: string;
  customerName?: string;
  customerPhone?: string;
  totalAmount: number;
  paymentStatus: 'unpaid' | 'paid';
  whatsappSent?: boolean;
  prepTimeMinutes?: number;
  elapsedMinutes?: number;
}

export interface TableItem {
  id: string;
  number: number;
  name: string;
  capacity: number;
  status: 'vacant' | 'occupied' | 'billing';
  activeOrderId?: string;
}

export interface MenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  isVeg: boolean;
  prepTimeMinutes: number;
  station: KitchenStation;
  description: string;
  isAvailable: boolean;
}

export interface Outlet {
  id: string;
  name: string;
  location: string;
  phone: string;
  active: boolean;
}

export interface StaffMember {
  id: string;
  name: string;
  role: UserRole;
  email: string;
  phone: string;
  active: boolean;
}

export interface LoyaltyCustomer {
  id: string;
  name: string;
  phone: string;
  points: number;
  tier: 'Silver' | 'Gold' | 'Platinum';
  totalSpent: number;
  lastVisit: string;
}

export interface WhiteLabelConfig {
  restaurantName: string;
  brandTagline: string;
  logoUrl?: string;
  accentColor: string;
  receiptHeader: string;
  receiptFooter: string;
}

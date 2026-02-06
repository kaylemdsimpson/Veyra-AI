// ─── Store ────────────────────────────────────────────────────
export interface Store {
  id: string;
  shopifyDomain: string;
  name: string | null;
  email: string | null;
  status: "active" | "paused" | "uninstalled" | "suspended";
  plan: string | null;
  settings: StoreSettings;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  installedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoreSettings {
  timezone: string;
  currency: string;
  maxDiscountPercent: number;
  maxMessagesPerRecovery: number;
  quietHoursStart: number;
  quietHoursEnd: number;
  emailEnabled: boolean;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
  holdoutPercent: number;
}

// ─── Customer ─────────────────────────────────────────────────
export interface Customer {
  id: string;
  storeId: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  totalOrders: number;
  totalSpent: string;
  isVip: boolean;
  ltv: string | null;
  preferredChannel: string | null;
  createdAt: string;
}

// ─── Abandon ──────────────────────────────────────────────────
export type AbandonType = "checkout" | "cart" | "browse";
export type RecoveryState =
  | "detected"
  | "qualified"
  | "scoring"
  | "sequencing"
  | "awaiting_send"
  | "sending"
  | "engaged"
  | "recovered"
  | "expired"
  | "cancelled"
  | "holdout";

export interface Abandon {
  id: string;
  storeId: string;
  type: AbandonType;
  state: RecoveryState;
  email: string | null;
  cartTotal: string | null;
  cartCurrency: string | null;
  lineItems: LineItem[];
  recoveredRevenue: string | null;
  recoveredAt: string | null;
  discountOffered: string | null;
  couponCode: string | null;
  createdAt: string;
}

export interface LineItem {
  productId: string;
  variantId: string;
  title: string;
  quantity: number;
  price: string;
  imageUrl?: string;
}

// ─── Message ──────────────────────────────────────────────────
export type MessageChannel = "email" | "sms" | "whatsapp";
export type MessageStatus =
  | "queued"
  | "scheduled"
  | "sending"
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "failed"
  | "unsubscribed"
  | "spam";

export interface Message {
  id: string;
  abandonId: string;
  channel: MessageChannel;
  status: MessageStatus;
  sequenceStep: number;
  subject: string | null;
  sentAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  createdAt: string;
}

// ─── Campaign (frontend abstraction over recovery settings) ──
export interface Campaign {
  id: string;
  name: string;
  status: "active" | "paused" | "draft";
  triggerType: AbandonType;
  messageCount: number;
  firstMessageDelayMinutes: number;
  discountEnabled: boolean;
  discountPercent: number | null;
  recoveredRevenue: string;
  recoveryRate: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Coupon ───────────────────────────────────────────────────
export interface Coupon {
  id: string;
  code: string;
  discountType: "percentage" | "fixed_amount";
  discountValue: string;
  status: "active" | "used" | "expired";
  expiresAt: string;
  createdAt: string;
}

// ─── Recovery Ledger ──────────────────────────────────────────
export interface RecoveryEntry {
  id: string;
  orderId: string;
  orderTotal: string;
  discountGiven: string;
  netRevenue: string;
  feeAmount: string;
  attributionConfidence: string;
  attributionSource: string;
  recoveredAt: string;
}

// ─── Dashboard Metrics ────────────────────────────────────────
export interface DashboardMetrics {
  period: string;
  abandons: {
    total: number;
    byType: Record<string, number>;
    byState: Record<string, number>;
  };
  recovery: {
    rate: number;
    totalRevenue: number;
    totalDiscounts: number;
    netRevenue: number;
    totalFees: number;
    avgOrderValue: number;
    avgConfidence: number;
  };
  messaging: {
    totalSent: number;
    openRate: number;
    clickRate: number;
    bounceRate: number;
    byChannel: Record<string, { sent: number; opened: number; clicked: number }>;
  };
  holdout: {
    recoveryRateWithVeyra: number;
    recoveryRateOrganic: number;
    incrementalLift: number;
  };
  customers: {
    totalTracked: number;
    vipCount: number;
    avgLtv: number;
  };
}

// ─── Billing ──────────────────────────────────────────────────
export interface BillingInfo {
  plan: string;
  status: "trialing" | "active" | "past_due" | "cancelled";
  baseFee: number;
  revenueSharePercent: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  recoveredThisPeriod: number;
  feeThisPeriod: number;
  estimatedNextCharge: number;
  stripeCustomerPortalUrl: string | null;
}

// ─── Auth ─────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  name: string | null;
  storeId: string;
  onboardingComplete: boolean;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

// ─── Integration Health ───────────────────────────────────────
export interface IntegrationHealth {
  webhooks: { status: "healthy" | "degraded" | "error"; lastEventAt: string | null };
  scriptInjection: { status: "healthy" | "degraded" | "error"; injectedAt: string | null };
  email: { status: "healthy" | "degraded" | "error"; provider: string };
  sms: { status: "healthy" | "degraded" | "error"; provider: string };
}

// ─── Onboarding ───────────────────────────────────────────────
export interface OnboardingStatus {
  step: "welcome" | "oauth" | "setup" | "complete";
  shopConnected: boolean;
  webhooksRegistered: boolean;
  scriptsInjected: boolean;
  defaultCampaignCreated: boolean;
  smartDiscountsEnabled: boolean;
}

// ─── API Responses ────────────────────────────────────────────
export interface ApiResponse<T> {
  data: T;
  error?: never;
}

export interface ApiError {
  data?: never;
  error: string;
  code: string;
}

export type ApiResult<T> = ApiResponse<T> | ApiError;

// ─── Revenue Over Time ───────────────────────────────────────
export interface RevenueDataPoint {
  date: string;
  recovered: number;
  fees: number;
  discounts: number;
}

// ─── Funnel ───────────────────────────────────────────────────
export interface FunnelStep {
  name: string;
  value: number;
  percent: number;
}

import type {
  User,
  DashboardMetrics,
  Campaign,
  BillingInfo,
  IntegrationHealth,
  OnboardingStatus,
  Store,
  RevenueDataPoint,
  FunnelStep,
} from "@veyra/types";

export const DEMO_USER: User = {
  id: "demo-user-001",
  email: "demo@veyra.io",
  name: "Demo User",
  storeId: "demo-store-001",
  onboardingComplete: true,
  createdAt: "2025-11-01T00:00:00Z",
};

export const DEMO_STORE: Store = {
  id: "demo-store-001",
  shopifyDomain: "demo-store.myshopify.com",
  name: "Demo Store",
  email: "demo@veyra.io",
  status: "active",
  plan: "growth",
  settings: {
    timezone: "Europe/Dublin",
    currency: "EUR",
    maxDiscountPercent: 15,
    maxMessagesPerRecovery: 4,
    quietHoursStart: 22,
    quietHoursEnd: 8,
    emailEnabled: true,
    smsEnabled: true,
    whatsappEnabled: false,
    holdoutPercent: 10,
  },
  stripeCustomerId: "cus_demo",
  stripeSubscriptionId: "sub_demo",
  installedAt: "2025-11-01T00:00:00Z",
  createdAt: "2025-11-01T00:00:00Z",
  updatedAt: "2025-12-15T00:00:00Z",
};

export const DEMO_METRICS: DashboardMetrics = {
  period: "30d",
  abandons: {
    total: 1_247,
    byType: { checkout: 834, cart: 312, browse: 101 },
    byState: {
      detected: 89,
      qualified: 42,
      sending: 31,
      engaged: 18,
      recovered: 412,
      expired: 601,
      holdout: 54,
    },
  },
  recovery: {
    rate: 33.0,
    totalRevenue: 48_720,
    totalDiscounts: 3_245,
    netRevenue: 45_475,
    totalFees: 4_547,
    avgOrderValue: 118.25,
    avgConfidence: 0.87,
  },
  messaging: {
    totalSent: 3_412,
    openRate: 52.3,
    clickRate: 18.7,
    bounceRate: 1.2,
    byChannel: {
      email: { sent: 2_800, opened: 1_540, clicked: 588 },
      sms: { sent: 612, opened: 490, clicked: 196 },
    },
  },
  holdout: {
    recoveryRateWithVeyra: 33.0,
    recoveryRateOrganic: 8.2,
    incrementalLift: 24.8,
  },
  customers: {
    totalTracked: 8_923,
    vipCount: 347,
    avgLtv: 284.5,
  },
};

export const DEMO_CAMPAIGNS: Campaign[] = [
  {
    id: "camp-1",
    name: "Checkout Recovery — Standard",
    status: "active",
    triggerType: "checkout",
    messageCount: 3,
    firstMessageDelayMinutes: 60,
    discountEnabled: true,
    discountPercent: 10,
    recoveredRevenue: "32480.00",
    recoveryRate: 38.2,
    createdAt: "2025-11-05T00:00:00Z",
    updatedAt: "2025-12-20T00:00:00Z",
  },
  {
    id: "camp-2",
    name: "Cart Abandon — Gentle Nudge",
    status: "active",
    triggerType: "cart",
    messageCount: 2,
    firstMessageDelayMinutes: 120,
    discountEnabled: false,
    discountPercent: null,
    recoveredRevenue: "12890.00",
    recoveryRate: 22.1,
    createdAt: "2025-11-10T00:00:00Z",
    updatedAt: "2025-12-18T00:00:00Z",
  },
  {
    id: "camp-3",
    name: "Browse Recovery — Product Reminder",
    status: "paused",
    triggerType: "browse",
    messageCount: 1,
    firstMessageDelayMinutes: 240,
    discountEnabled: false,
    discountPercent: null,
    recoveredRevenue: "3350.00",
    recoveryRate: 8.4,
    createdAt: "2025-11-15T00:00:00Z",
    updatedAt: "2025-12-10T00:00:00Z",
  },
];

export const DEMO_BILLING: BillingInfo = {
  plan: "Growth",
  status: "active",
  baseFee: 49,
  revenueSharePercent: 5,
  currentPeriodStart: "2026-01-01T00:00:00Z",
  currentPeriodEnd: "2026-02-01T00:00:00Z",
  recoveredThisPeriod: 48_720,
  feeThisPeriod: 2_485,
  estimatedNextCharge: 2_534,
  stripeCustomerPortalUrl: null,
};

export const DEMO_HEALTH: IntegrationHealth = {
  webhooks: { status: "healthy", lastEventAt: new Date().toISOString() },
  scriptInjection: { status: "healthy", injectedAt: "2025-11-01T00:00:00Z" },
  email: { status: "healthy", provider: "Resend" },
  sms: { status: "degraded", provider: "Twilio" },
};

export const DEMO_ONBOARDING: OnboardingStatus = {
  step: "complete",
  shopConnected: true,
  webhooksRegistered: true,
  scriptsInjected: true,
  defaultCampaignCreated: true,
  smartDiscountsEnabled: true,
};

function generateRevenueData(): RevenueDataPoint[] {
  const data: RevenueDataPoint[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const base = 1200 + Math.random() * 800;
    data.push({
      date: date.toISOString().split("T")[0]!,
      recovered: Math.round(base),
      fees: Math.round(base * 0.05),
      discounts: Math.round(base * 0.07),
    });
  }
  return data;
}

export const DEMO_REVENUE: RevenueDataPoint[] = generateRevenueData();

export const DEMO_FUNNEL: FunnelStep[] = [
  { name: "Abandoned", value: 1247, percent: 100 },
  { name: "Qualified", value: 986, percent: 79.1 },
  { name: "Contacted", value: 742, percent: 59.5 },
  { name: "Engaged", value: 389, percent: 31.2 },
  { name: "Recovered", value: 412, percent: 33.0 },
];

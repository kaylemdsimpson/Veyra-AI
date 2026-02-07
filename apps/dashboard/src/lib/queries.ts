import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  DashboardMetrics,
  Campaign,
  BillingInfo,
  IntegrationHealth,
  OnboardingStatus,
  Store,
  RecoveryEntry,
  RevenueDataPoint,
  FunnelStep,
} from "@veyra/types";
import { api } from "./api";
import { useAuth } from "./auth";
import {
  DEMO_METRICS,
  DEMO_CAMPAIGNS,
  DEMO_BILLING,
  DEMO_HEALTH,
  DEMO_ONBOARDING,
  DEMO_STORE,
  DEMO_REVENUE,
  DEMO_FUNNEL,
} from "./demo-data";

// ─── Dashboard ────────────────────────────────────────────────
export function useMetrics(period = "30d") {
  const { isDemo } = useAuth();
  return useQuery({
    queryKey: ["metrics", period],
    queryFn: () => isDemo ? DEMO_METRICS : api.get<DashboardMetrics>(`/api/dashboard/metrics?period=${period}`),
  });
}

export function useRevenueOverTime(period = "30d") {
  const { isDemo } = useAuth();
  return useQuery({
    queryKey: ["revenue-over-time", period],
    queryFn: () => isDemo ? DEMO_REVENUE : api.get<RevenueDataPoint[]>(`/api/dashboard/revenue?period=${period}`),
  });
}

// ─── Campaigns ────────────────────────────────────────────────
export function useCampaigns() {
  const { isDemo } = useAuth();
  return useQuery({
    queryKey: ["campaigns"],
    queryFn: () => isDemo ? DEMO_CAMPAIGNS : api.get<Campaign[]>("/api/campaigns"),
  });
}

export function useCampaign(id: string) {
  const { isDemo } = useAuth();
  return useQuery({
    queryKey: ["campaigns", id],
    queryFn: () => isDemo ? DEMO_CAMPAIGNS.find((c) => c.id === id)! : api.get<Campaign>(`/api/campaigns/${id}`),
    enabled: !!id,
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Campaign>) => api.post<Campaign>("/api/campaigns", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaigns"] }),
  });
}

export function useUpdateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Campaign> & { id: string }) =>
      api.put<Campaign>(`/api/campaigns/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaigns"] }),
  });
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/campaigns/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaigns"] }),
  });
}

// ─── Billing ──────────────────────────────────────────────────
export function useBilling() {
  const { isDemo } = useAuth();
  return useQuery({
    queryKey: ["billing"],
    queryFn: () => isDemo ? DEMO_BILLING : api.get<BillingInfo>("/api/billing"),
  });
}

export function useRecoveries(period = "30d") {
  const { isDemo } = useAuth();
  return useQuery({
    queryKey: ["recoveries", period],
    queryFn: () => isDemo ? [] as RecoveryEntry[] : api.get<RecoveryEntry[]>(`/api/recoveries?period=${period}`),
  });
}

// ─── Store & Health ───────────────────────────────────────────
export function useStore() {
  const { isDemo } = useAuth();
  return useQuery({
    queryKey: ["store"],
    queryFn: () => isDemo ? DEMO_STORE : api.get<Store>("/api/store"),
  });
}

export function useIntegrationHealth() {
  const { isDemo } = useAuth();
  return useQuery({
    queryKey: ["health"],
    queryFn: () => isDemo ? DEMO_HEALTH : api.get<IntegrationHealth>("/api/health/integration"),
    refetchInterval: isDemo ? false : 60_000,
  });
}

// ─── Onboarding ───────────────────────────────────────────────
export function useOnboardingStatus() {
  const { isDemo } = useAuth();
  return useQuery({
    queryKey: ["onboarding"],
    queryFn: () => isDemo ? DEMO_ONBOARDING : api.get<OnboardingStatus>("/api/onboarding/status"),
  });
}

// ─── Snippet ─────────────────────────────────────────────────
export function useSnippetInstall(storeId: string | undefined) {
  const { isDemo } = useAuth();
  return useQuery({
    queryKey: ["snippet-install", storeId],
    queryFn: () =>
      isDemo
        ? {
            snippet: '<!-- Veyra Recovery -->\n<script src="https://app.veyra.com/snippet/v.js" data-veyra-token="veyra_demo_token" async></script>\n<!-- End Veyra -->',
            token: "veyra_demo_token",
            domain: "demo-store.myshopify.com",
            instructions: [
              "1. Copy the snippet above",
              "2. In Shopify Admin, go to Online Store → Themes → Edit Code",
              "3. Open theme.liquid",
              "4. Paste the snippet just before the closing </head> tag",
              "5. Save — Veyra is now active on your storefront",
            ],
          }
        : api.get<{
            snippet: string;
            token: string;
            domain: string;
            instructions: string[];
          }>(`/snippet/install?storeId=${storeId}`),
    enabled: !!storeId,
  });
}

export function useFlowStatus(storeId: string | undefined) {
  const { isDemo } = useAuth();
  return useQuery({
    queryKey: ["flow-status", storeId],
    queryFn: () =>
      isDemo
        ? { storeId: "demo", snippetInstalled: true, totalFlows: 48, activeFlows: 42, inactiveFlows: 6, flows: [] }
        : api.get<{
            storeId: string;
            snippetInstalled: boolean;
            totalFlows: number;
            activeFlows: number;
            inactiveFlows: number;
            flows: Array<{ id: number; name: string; active: boolean; reason: string }>;
          }>(`/snippet/status?storeId=${storeId}`),
    enabled: !!storeId,
  });
}

// ─── Analytics ────────────────────────────────────────────────
export function useFunnel(period = "30d") {
  const { isDemo } = useAuth();
  return useQuery({
    queryKey: ["funnel", period],
    queryFn: () => isDemo ? DEMO_FUNNEL : api.get<FunnelStep[]>(`/api/analytics/funnel?period=${period}`),
  });
}

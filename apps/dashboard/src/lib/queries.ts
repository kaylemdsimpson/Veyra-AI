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

// ─── Dashboard ────────────────────────────────────────────────
export function useMetrics(period = "30d") {
  return useQuery({
    queryKey: ["metrics", period],
    queryFn: () => api.get<DashboardMetrics>(`/api/dashboard/metrics?period=${period}`),
  });
}

export function useRevenueOverTime(period = "30d") {
  return useQuery({
    queryKey: ["revenue-over-time", period],
    queryFn: () => api.get<RevenueDataPoint[]>(`/api/dashboard/revenue?period=${period}`),
  });
}

// ─── Campaigns ────────────────────────────────────────────────
export function useCampaigns() {
  return useQuery({
    queryKey: ["campaigns"],
    queryFn: () => api.get<Campaign[]>("/api/campaigns"),
  });
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: ["campaigns", id],
    queryFn: () => api.get<Campaign>(`/api/campaigns/${id}`),
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
  return useQuery({
    queryKey: ["billing"],
    queryFn: () => api.get<BillingInfo>("/api/billing"),
  });
}

export function useRecoveries(period = "30d") {
  return useQuery({
    queryKey: ["recoveries", period],
    queryFn: () => api.get<RecoveryEntry[]>(`/api/recoveries?period=${period}`),
  });
}

// ─── Store & Health ───────────────────────────────────────────
export function useStore() {
  return useQuery({
    queryKey: ["store"],
    queryFn: () => api.get<Store>("/api/store"),
  });
}

export function useIntegrationHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => api.get<IntegrationHealth>("/api/health/integration"),
    refetchInterval: 60_000,
  });
}

// ─── Onboarding ───────────────────────────────────────────────
export function useOnboardingStatus() {
  return useQuery({
    queryKey: ["onboarding"],
    queryFn: () => api.get<OnboardingStatus>("/api/onboarding/status"),
  });
}

// ─── Analytics ────────────────────────────────────────────────
export function useFunnel(period = "30d") {
  return useQuery({
    queryKey: ["funnel", period],
    queryFn: () => api.get<FunnelStep[]>(`/api/analytics/funnel?period=${period}`),
  });
}

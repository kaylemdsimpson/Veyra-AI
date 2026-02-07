"use client";

import { useState } from "react";
import { useMetrics, useRevenueOverTime } from "@/lib/queries";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatPercent } from "@/lib/utils";
import {
  DollarSign,
  TrendingUp,
  ShoppingCart,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Mail,
  Zap,
  Tag,
} from "lucide-react";
import { RevenueChart } from "@/components/revenue-chart";

export default function DashboardOverviewPage() {
  const [period, setPeriod] = useState("30d");
  const { data: metrics, isLoading } = useMetrics(period);
  const { data: revenueData, isLoading: chartLoading } = useRevenueOverTime(period);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">Your recovery performance at a glance</p>
        </div>
        <div className="flex rounded-lg border bg-card p-1">
          {["7d", "30d", "90d"].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-4 py-1.5 text-xs font-medium transition-all ${
                period === p
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p === "7d" ? "7 days" : p === "30d" ? "30 days" : "90 days"}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Revenue Recovered"
          value={metrics ? formatCurrency(metrics.recovery.totalRevenue) : undefined}
          trend={+12.5}
          icon={<DollarSign className="h-5 w-5" />}
          iconColor="bg-emerald-500/10 text-emerald-600"
          isLoading={isLoading}
        />
        <KpiCard
          title="Recovery Rate"
          value={metrics ? formatPercent(metrics.recovery.rate) : undefined}
          trend={+3.2}
          icon={<TrendingUp className="h-5 w-5" />}
          iconColor="bg-primary/10 text-primary"
          isLoading={isLoading}
        />
        <KpiCard
          title="Abandons Detected"
          value={metrics ? metrics.abandons.total.toLocaleString() : undefined}
          trend={-2.1}
          icon={<ShoppingCart className="h-5 w-5" />}
          iconColor="bg-orange-500/10 text-orange-600"
          isLoading={isLoading}
        />
        <KpiCard
          title="Net Revenue"
          value={metrics ? formatCurrency(metrics.recovery.netRevenue) : undefined}
          trend={+8.7}
          icon={<BarChart3 className="h-5 w-5" />}
          iconColor="bg-blue-500/10 text-blue-600"
          isLoading={isLoading}
        />
      </div>

      {/* Revenue Chart */}
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">Revenue Over Time</h3>
            <p className="text-sm text-muted-foreground">Daily recovered revenue</p>
          </div>
          {metrics && (
            <div className="text-right">
              <p className="text-2xl font-bold">{formatCurrency(metrics.recovery.totalRevenue)}</p>
              <p className="text-xs text-emerald-600">+12.5% vs previous period</p>
            </div>
          )}
        </div>
        {chartLoading ? (
          <Skeleton className="h-[300px] w-full rounded-lg" />
        ) : revenueData && revenueData.length > 0 ? (
          <RevenueChart data={revenueData} />
        ) : (
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            Revenue data will appear once recoveries start coming in.
          </div>
        )}
      </div>

      {/* Secondary metrics */}
      {metrics && (
        <div className="grid gap-5 sm:grid-cols-3">
          <SecondaryCard
            title="Messages Sent"
            value={metrics.messaging.totalSent.toLocaleString()}
            subtitle={`${formatPercent(metrics.messaging.openRate)} open · ${formatPercent(metrics.messaging.clickRate)} click`}
            icon={<Mail className="h-5 w-5" />}
            iconColor="bg-blue-500/10 text-blue-600"
          />
          <SecondaryCard
            title="Veyra Lift"
            value={`+${formatPercent(metrics.holdout.incrementalLift)}`}
            subtitle={`vs organic (${formatPercent(metrics.holdout.recoveryRateOrganic)})`}
            icon={<Zap className="h-5 w-5" />}
            iconColor="bg-primary/10 text-primary"
          />
          <SecondaryCard
            title="Discounts Given"
            value={formatCurrency(metrics.recovery.totalDiscounts)}
            subtitle={`Avg order: ${formatCurrency(metrics.recovery.avgOrderValue)}`}
            icon={<Tag className="h-5 w-5" />}
            iconColor="bg-orange-500/10 text-orange-600"
          />
        </div>
      )}
    </div>
  );
}

function KpiCard({
  title,
  value,
  trend,
  icon,
  iconColor,
  isLoading,
}: {
  title: string;
  value: string | undefined;
  trend: number;
  icon: React.ReactNode;
  iconColor: string;
  isLoading: boolean;
}) {
  const isPositive = trend >= 0;
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className={`rounded-lg p-2.5 ${iconColor}`}>{icon}</div>
        {!isLoading && (
          <div
            className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${
              isPositive ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"
            }`}
          >
            {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <div className="mt-4">
        {isLoading ? (
          <Skeleton className="h-8 w-28" />
        ) : (
          <p className="text-2xl font-bold tracking-tight">{value}</p>
        )}
        <p className="mt-0.5 text-xs text-muted-foreground">{title}</p>
      </div>
    </div>
  );
}

function SecondaryCard({
  title,
  value,
  subtitle,
  icon,
  iconColor,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  iconColor: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2.5 ${iconColor}`}>{icon}</div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

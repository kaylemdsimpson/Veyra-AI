"use client";

import { useState } from "react";
import { useMetrics, useRevenueOverTime } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { DollarSign, TrendingUp, ShoppingCart, BarChart3 } from "lucide-react";
import { RevenueChart } from "@/components/revenue-chart";

export default function DashboardOverviewPage() {
  const [period, setPeriod] = useState("30d");
  const { data: metrics, isLoading } = useMetrics(period);
  const { data: revenueData, isLoading: chartLoading } = useRevenueOverTime(period);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
          <p className="text-muted-foreground">Your recovery performance at a glance.</p>
        </div>
        <Tabs value={period} onValueChange={setPeriod}>
          <TabsList>
            <TabsTrigger value="7d">7 days</TabsTrigger>
            <TabsTrigger value="30d">30 days</TabsTrigger>
            <TabsTrigger value="90d">90 days</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Revenue Recovered"
          value={metrics ? formatCurrency(metrics.recovery.totalRevenue) : undefined}
          icon={<DollarSign className="h-4 w-4" />}
          description="Total recovered from abandoned carts"
          isLoading={isLoading}
        />
        <KpiCard
          title="Recovery Rate"
          value={metrics ? formatPercent(metrics.recovery.rate) : undefined}
          icon={<TrendingUp className="h-4 w-4" />}
          description="Of all abandons recovered"
          isLoading={isLoading}
        />
        <KpiCard
          title="Abandons Detected"
          value={metrics ? metrics.abandons.total.toLocaleString() : undefined}
          icon={<ShoppingCart className="h-4 w-4" />}
          description="Checkout, cart, and browse"
          isLoading={isLoading}
        />
        <KpiCard
          title="Net Revenue"
          value={metrics ? formatCurrency(metrics.recovery.netRevenue) : undefined}
          icon={<BarChart3 className="h-4 w-4" />}
          description="After discounts"
          isLoading={isLoading}
        />
      </div>

      {/* Revenue Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Revenue over time</CardTitle>
        </CardHeader>
        <CardContent>
          {chartLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : revenueData && revenueData.length > 0 ? (
            <RevenueChart data={revenueData} />
          ) : (
            <div className="flex h-[300px] items-center justify-center text-muted-foreground">
              Revenue data will appear once recoveries start coming in.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Secondary metrics */}
      {metrics && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Messages Sent
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{metrics.messaging.totalSent.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">
                {formatPercent(metrics.messaging.openRate)} open rate &middot;{" "}
                {formatPercent(metrics.messaging.clickRate)} click rate
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Veyra Lift
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                +{formatPercent(metrics.holdout.incrementalLift)}
              </p>
              <p className="text-xs text-muted-foreground">
                vs organic recovery ({formatPercent(metrics.holdout.recoveryRateOrganic)})
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Discounts Given
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {formatCurrency(metrics.recovery.totalDiscounts)}
              </p>
              <p className="text-xs text-muted-foreground">
                Avg order value: {formatCurrency(metrics.recovery.avgOrderValue)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  title,
  value,
  icon,
  description,
  isLoading,
}: {
  title: string;
  value: string | undefined;
  icon: React.ReactNode;
  description: string;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useState } from "react";
import { useMetrics, useFunnel, useRevenueOverTime } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RevenueChart } from "@/components/revenue-chart";
import { formatCurrency, formatPercent } from "@/lib/utils";

export default function AnalyticsPage() {
  const [period, setPeriod] = useState("30d");
  const { data: metrics, isLoading: metricsLoading } = useMetrics(period);
  const { data: funnel, isLoading: funnelLoading } = useFunnel(period);
  const { data: revenueData, isLoading: revenueLoading } = useRevenueOverTime(period);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">Recovery funnel, messaging performance, and holdout lift.</p>
        </div>
        <Tabs value={period} onValueChange={setPeriod}>
          <TabsList>
            <TabsTrigger value="7d">7d</TabsTrigger>
            <TabsTrigger value="30d">30d</TabsTrigger>
            <TabsTrigger value="90d">90d</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Recovery Funnel */}
      <Card>
        <CardHeader>
          <CardTitle>Recovery Funnel</CardTitle>
          <CardDescription>From abandon detection to recovered revenue.</CardDescription>
        </CardHeader>
        <CardContent>
          {funnelLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : funnel && funnel.length > 0 ? (
            <div className="space-y-3">
              {funnel.map((step, i) => (
                <div key={step.name} className="flex items-center gap-4">
                  <div className="w-40 shrink-0 text-sm font-medium">{step.name}</div>
                  <div className="flex-1">
                    <div className="relative h-8 overflow-hidden rounded bg-muted">
                      <div
                        className="absolute inset-y-0 left-0 rounded bg-primary transition-all"
                        style={{ width: `${step.percent}%` }}
                      />
                      <div className="absolute inset-0 flex items-center px-3 text-xs font-medium">
                        {step.value.toLocaleString()} ({formatPercent(step.percent)})
                      </div>
                    </div>
                  </div>
                  {i < funnel.length - 1 && (
                    <div className="w-16 text-right text-xs text-muted-foreground">
                      {funnel[i + 1] && step.value > 0
                        ? formatPercent((funnel[i + 1].value / step.value) * 100)
                        : "—"}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No funnel data yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Revenue Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          {revenueLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <RevenueChart data={revenueData ?? []} />
          )}
        </CardContent>
      </Card>

      {/* Messaging Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Messaging Performance</CardTitle>
          <CardDescription>Delivery, open, and click rates by channel.</CardDescription>
        </CardHeader>
        <CardContent>
          {metricsLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : metrics ? (
            <div className="space-y-6">
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total sent</p>
                  <p className="text-2xl font-bold">{metrics.messaging.totalSent.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Open rate</p>
                  <p className="text-2xl font-bold">{formatPercent(metrics.messaging.openRate)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Click rate</p>
                  <p className="text-2xl font-bold">{formatPercent(metrics.messaging.clickRate)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Bounce rate</p>
                  <p className="text-2xl font-bold">{formatPercent(metrics.messaging.bounceRate)}</p>
                </div>
              </div>
              {Object.keys(metrics.messaging.byChannel).length > 0 && (
                <div>
                  <h4 className="mb-3 text-sm font-medium text-muted-foreground">By Channel</h4>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {Object.entries(metrics.messaging.byChannel).map(([channel, stats]) => (
                      <div key={channel} className="rounded-lg border p-3">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="text-sm font-semibold capitalize">{channel}</span>
                          <Badge variant="secondary">{stats.sent} sent</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                          <span>Opened: {stats.opened}</span>
                          <span>Clicked: {stats.clicked}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Holdout Lift */}
      <Card>
        <CardHeader>
          <CardTitle>Holdout Analysis</CardTitle>
          <CardDescription>
            Compares recovery rates between Veyra-contacted and holdout groups to measure true incremental lift.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {metricsLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : metrics ? (
            <div className="grid grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-muted-foreground">With Veyra</p>
                <p className="text-2xl font-bold">
                  {formatPercent(metrics.holdout.recoveryRateWithVeyra)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Organic (holdout)</p>
                <p className="text-2xl font-bold">
                  {formatPercent(metrics.holdout.recoveryRateOrganic)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Incremental lift</p>
                <p className="text-2xl font-bold text-primary">
                  +{formatPercent(metrics.holdout.incrementalLift)}
                </p>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Abandon breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Abandon Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {metricsLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : metrics ? (
            <div className="space-y-4">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold">{metrics.abandons.total.toLocaleString()}</span>
                <span className="text-muted-foreground">total abandons</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(metrics.abandons.byType).map(([type, count]) => (
                  <Badge key={type} variant="outline" className="text-sm">
                    {type}: {(count as number).toLocaleString()}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

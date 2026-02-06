"use client";

import { useStore, useIntegrationHealth, useBilling } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ExternalLink, CheckCircle, AlertTriangle, XCircle } from "lucide-react";

function StatusIcon({ status }: { status: "healthy" | "degraded" | "error" }) {
  if (status === "healthy") return <CheckCircle className="h-4 w-4 text-green-500" />;
  if (status === "degraded") return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
  return <XCircle className="h-4 w-4 text-red-500" />;
}

function StoreSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { data: store, isLoading: storeLoading } = useStore();
  const { data: health, isLoading: healthLoading } = useIntegrationHealth();
  const { data: billing, isLoading: billingLoading } = useBilling();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your store, account, billing, and integrations.</p>
      </div>

      <Tabs defaultValue="store">
        <TabsList>
          <TabsTrigger value="store">Store</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="health">Health</TabsTrigger>
          <TabsTrigger value="support">Support</TabsTrigger>
        </TabsList>

        {/* ─── Store ──────────────────────────────────────── */}
        <TabsContent value="store" className="mt-6 space-y-6">
          {storeLoading ? (
            <StoreSkeleton />
          ) : store ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Store Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Shopify domain</span>
                    <span className="text-sm font-medium">{store.shopifyDomain}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Store name</span>
                    <span className="text-sm font-medium">{store.name ?? "—"}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge variant={store.status === "active" ? "default" : "secondary"}>
                      {store.status}
                    </Badge>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Installed</span>
                    <span className="text-sm font-medium">{formatDate(store.installedAt)}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recovery Settings</CardTitle>
                  <CardDescription>Global limits applied to all campaigns.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Max discount</p>
                    <p className="font-semibold">{store.settings.maxDiscountPercent}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Max messages</p>
                    <p className="font-semibold">{store.settings.maxMessagesPerRecovery}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Holdout %</p>
                    <p className="font-semibold">{store.settings.holdoutPercent}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Quiet hours</p>
                    <p className="font-semibold">
                      {store.settings.quietHoursStart}:00 – {store.settings.quietHoursEnd}:00
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Timezone</p>
                    <p className="font-semibold">{store.settings.timezone}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Currency</p>
                    <p className="font-semibold">{store.settings.currency}</p>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <p className="text-muted-foreground">No store data available.</p>
          )}
        </TabsContent>

        {/* ─── Account ────────────────────────────────────── */}
        <TabsContent value="account" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Email</span>
                <span className="text-sm font-medium">{user?.email ?? "—"}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Name</span>
                <span className="text-sm font-medium">{user?.name ?? "—"}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Member since</span>
                <span className="text-sm font-medium">
                  {user?.createdAt ? formatDate(user.createdAt) : "—"}
                </span>
              </div>
            </CardContent>
          </Card>
          <Button variant="destructive" onClick={logout}>
            Sign out
          </Button>
        </TabsContent>

        {/* ─── Billing ────────────────────────────────────── */}
        <TabsContent value="billing" className="mt-6 space-y-6">
          {billingLoading ? (
            <StoreSkeleton />
          ) : billing ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Current Plan</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Plan</span>
                    <Badge>{billing.plan}</Badge>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge
                      variant={
                        billing.status === "active" || billing.status === "trialing"
                          ? "default"
                          : "destructive"
                      }
                    >
                      {billing.status}
                    </Badge>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Base fee</span>
                    <span className="text-sm font-medium">{formatCurrency(billing.baseFee)}/mo</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Revenue share</span>
                    <span className="text-sm font-medium">{billing.revenueSharePercent}%</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>This Period</CardTitle>
                  <CardDescription>
                    {formatDate(billing.currentPeriodStart)} — {formatDate(billing.currentPeriodEnd)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-6">
                  <div>
                    <p className="text-sm text-muted-foreground">Recovered</p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(billing.recoveredThisPeriod)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Fees accrued</p>
                    <p className="text-2xl font-bold">{formatCurrency(billing.feeThisPeriod)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Est. next charge</p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(billing.estimatedNextCharge)}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {billing.stripeCustomerPortalUrl && (
                <Button variant="outline" asChild>
                  <a
                    href={billing.stripeCustomerPortalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Manage in Stripe <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">No billing data available.</p>
          )}
        </TabsContent>

        {/* ─── Health ─────────────────────────────────────── */}
        <TabsContent value="health" className="mt-6 space-y-6">
          {healthLoading ? (
            <StoreSkeleton />
          ) : health ? (
            <Card>
              <CardHeader>
                <CardTitle>Integration Health</CardTitle>
                <CardDescription>
                  Live status of all integrations. Refreshes every 60 seconds.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(
                  [
                    { key: "webhooks" as const, label: "Shopify Webhooks" },
                    { key: "scriptInjection" as const, label: "Script Injection" },
                    { key: "email" as const, label: "Email Provider" },
                    { key: "sms" as const, label: "SMS Provider" },
                  ] as const
                ).map(({ key, label }) => {
                  const item = health[key];
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <StatusIcon status={item.status} />
                          <span className="text-sm font-medium">{label}</span>
                        </div>
                        <Badge
                          variant={
                            item.status === "healthy"
                              ? "default"
                              : item.status === "degraded"
                                ? "secondary"
                                : "destructive"
                          }
                        >
                          {item.status}
                        </Badge>
                      </div>
                      {key !== "sms" && <Separator className="mt-3" />}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ) : (
            <p className="text-muted-foreground">Health data unavailable.</p>
          )}
        </TabsContent>

        {/* ─── Support ────────────────────────────────────── */}
        <TabsContent value="support" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Support</CardTitle>
              <CardDescription>Need help? Reach out to us.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium">Email</p>
                <p className="text-sm text-muted-foreground">support@veyra.io</p>
              </div>
              <Separator />
              <div>
                <p className="text-sm font-medium">Documentation</p>
                <p className="text-sm text-muted-foreground">
                  Visit our help centre for guides, FAQs, and API docs.
                </p>
              </div>
              <Separator />
              <div>
                <p className="text-sm font-medium">Status</p>
                <p className="text-sm text-muted-foreground">
                  Check real-time system status on the Health tab above.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

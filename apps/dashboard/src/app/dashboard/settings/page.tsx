"use client";

import { useState } from "react";
import { useStore, useIntegrationHealth, useBilling, useSnippetInstall, useFlowStatus } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ExternalLink, CheckCircle, AlertTriangle, XCircle, Copy, Check, Code2 } from "lucide-react";

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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? (
        <>
          <Check className="mr-2 h-4 w-4" /> Copied
        </>
      ) : (
        <>
          <Copy className="mr-2 h-4 w-4" /> Copy snippet
        </>
      )}
    </Button>
  );
}

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { data: store, isLoading: storeLoading } = useStore();
  const { data: health, isLoading: healthLoading } = useIntegrationHealth();
  const { data: billing, isLoading: billingLoading } = useBilling();
  const { data: snippetData, isLoading: snippetLoading } = useSnippetInstall(store?.id);
  const { data: flowStatus, isLoading: flowLoading } = useFlowStatus(store?.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your store, account, billing, and integrations.</p>
      </div>

      <Tabs defaultValue="install">
        <TabsList>
          <TabsTrigger value="install">Install</TabsTrigger>
          <TabsTrigger value="store">Store</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="health">Health</TabsTrigger>
          <TabsTrigger value="support">Support</TabsTrigger>
        </TabsList>

        {/* ─── Install ─────────────────────────────────────── */}
        <TabsContent value="install" className="mt-6 space-y-6">
          {snippetLoading || storeLoading ? (
            <StoreSkeleton />
          ) : snippetData ? (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Code2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle>Tracking Snippet</CardTitle>
                      <CardDescription>
                        Paste this into your Shopify theme to activate Veyra on your storefront.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="relative">
                    <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 text-sm font-mono">
                      {snippetData.snippet}
                    </pre>
                    <div className="mt-3">
                      <CopyButton text={snippetData.snippet} />
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <p className="text-sm font-medium">Installation steps</p>
                    {snippetData.instructions.map((step, i) => (
                      <p key={i} className="text-sm text-muted-foreground">{step}</p>
                    ))}
                  </div>

                  <Separator />

                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      Security notice
                    </p>
                    <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                      This token is bound to <strong>{snippetData.domain}</strong>. It will only work on your
                      registered Shopify domain. Sharing it with other stores will not work — they will need
                      to install Veyra separately.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Flow Status */}
              {flowStatus && (
                <Card>
                  <CardHeader>
                    <CardTitle>Active Flows</CardTitle>
                    <CardDescription>
                      {flowStatus.activeFlows} of {flowStatus.totalFlows} flows are active based on your
                      current settings. Flows activate automatically — no configuration needed.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      <div className="rounded-lg border p-3 text-center">
                        <p className="text-2xl font-bold text-green-600">{flowStatus.activeFlows}</p>
                        <p className="text-xs text-muted-foreground">Active</p>
                      </div>
                      <div className="rounded-lg border p-3 text-center">
                        <p className="text-2xl font-bold text-muted-foreground">{flowStatus.inactiveFlows}</p>
                        <p className="text-xs text-muted-foreground">Inactive</p>
                      </div>
                      <div className="rounded-lg border p-3 text-center">
                        <p className="text-2xl font-bold">{flowStatus.totalFlows}</p>
                        <p className="text-xs text-muted-foreground">Total</p>
                      </div>
                    </div>

                    {flowStatus.flows && flowStatus.flows.length > 0 && (
                      <div className="space-y-2 max-h-80 overflow-y-auto">
                        {flowStatus.flows.map((flow) => (
                          <div key={flow.id} className="flex items-center justify-between py-1.5">
                            <div className="flex items-center gap-2">
                              <div className={`h-2 w-2 rounded-full ${flow.active ? "bg-green-500" : "bg-gray-300"}`} />
                              <span className="text-sm">
                                <span className="text-muted-foreground font-mono text-xs mr-2">
                                  {String(flow.id).padStart(2, "0")}
                                </span>
                                {flow.name}
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground max-w-[200px] truncate">
                              {flow.reason}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">
                  Connect your Shopify store to generate your tracking snippet.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

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

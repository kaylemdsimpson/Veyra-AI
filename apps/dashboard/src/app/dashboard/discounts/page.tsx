"use client";

import { useStore } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck, Percent, Timer, DollarSign, Users } from "lucide-react";

const gates = [
  {
    icon: Percent,
    title: "Recovery Probability Gate",
    desc: "Only offers a discount when the ML model predicts the customer is unlikely to convert without one.",
  },
  {
    icon: ShieldCheck,
    title: "Abuse Prevention Gate",
    desc: "Blocks repeat-abandoners who strategically abandon to farm discounts. Tracks patterns per customer.",
  },
  {
    icon: Users,
    title: "First-Touch Rule",
    desc: "Never discounts the very first recovery message. Gives the reminder a chance to work on its own.",
  },
  {
    icon: DollarSign,
    title: "Cart Floor Gate",
    desc: "Skips discounts for carts below a configurable minimum value — small carts don't need incentive.",
  },
  {
    icon: Timer,
    title: "Margin Safety Gate",
    desc: "Ensures discount never exceeds a store-configured ceiling, protecting profit margins.",
  },
];

export default function DiscountsPage() {
  const { data: store, isLoading } = useStore();

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Smart Discounts</h1>
          <p className="text-muted-foreground">AI-powered discount engine with 5 safety gates.</p>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const settings = store?.settings;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Smart Discounts</h1>
        <p className="text-muted-foreground">
          Discounts are a last resort. Every offer passes through 5 safety gates before reaching a customer.
        </p>
      </div>

      {/* Current config summary */}
      <Card>
        <CardHeader>
          <CardTitle>Current Configuration</CardTitle>
          <CardDescription>Configured limits for your store.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <div>
              <p className="text-sm text-muted-foreground">Max discount</p>
              <p className="text-2xl font-bold">{settings?.maxDiscountPercent ?? 15}%</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Max messages / recovery</p>
              <p className="text-2xl font-bold">{settings?.maxMessagesPerRecovery ?? 3}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Holdout group</p>
              <p className="text-2xl font-bold">{settings?.holdoutPercent ?? 5}%</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Quiet hours</p>
              <p className="text-2xl font-bold">
                {settings?.quietHoursStart ?? 22}:00–{settings?.quietHoursEnd ?? 8}:00
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gate cards */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">5 Safety Gates</h2>
        <div className="space-y-4">
          {gates.map((gate, i) => {
            const Icon = gate.icon;
            return (
              <Card key={i}>
                <CardContent className="flex items-start gap-4 py-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{gate.title}</h3>
                      <Badge variant="secondary">Gate {i + 1}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{gate.desc}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Channels status */}
      <Card>
        <CardHeader>
          <CardTitle>Message Channels</CardTitle>
          <CardDescription>Active channels for recovery messages.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Badge variant={settings?.emailEnabled ? "default" : "outline"}>
              Email {settings?.emailEnabled ? "ON" : "OFF"}
            </Badge>
            <Badge variant={settings?.smsEnabled ? "default" : "outline"}>
              SMS {settings?.smsEnabled ? "ON" : "OFF"}
            </Badge>
            <Badge variant={settings?.whatsappEnabled ? "default" : "outline"}>
              WhatsApp {settings?.whatsappEnabled ? "ON" : "OFF"}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCreateCampaign } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { AbandonType } from "@veyra/types";

const triggerTypes: { value: AbandonType; label: string; desc: string }[] = [
  { value: "checkout", label: "Checkout", desc: "Abandoned at checkout" },
  { value: "cart", label: "Cart", desc: "Added to cart but left" },
  { value: "browse", label: "Browse", desc: "Viewed product but didn't add" },
];

export default function NewCampaignPage() {
  const router = useRouter();
  const createCampaign = useCreateCampaign();

  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState<AbandonType>("checkout");
  const [messageCount, setMessageCount] = useState(3);
  const [firstDelay, setFirstDelay] = useState(1);
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountPercent, setDiscountPercent] = useState(10);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createCampaign.mutateAsync({
      name,
      triggerType,
      messageCount,
      firstMessageDelayMinutes: firstDelay * 60,
      discountEnabled,
      discountPercent: discountEnabled ? discountPercent : null,
      status: "draft",
    });
    router.push("/dashboard/campaigns");
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/campaigns">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Campaign</h1>
          <p className="text-muted-foreground">Set up a recovery message sequence.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Basics</CardTitle>
            <CardDescription>Give your campaign a name and choose a trigger.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Campaign name</Label>
              <Input
                id="name"
                placeholder="e.g. Checkout Recovery — Gentle"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Trigger type</Label>
              <div className="grid grid-cols-3 gap-3">
                {triggerTypes.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTriggerType(t.value)}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      triggerType === t.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="font-medium">{t.label}</div>
                    <div className="text-xs text-muted-foreground">{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Timing</CardTitle>
            <CardDescription>Configure when and how many messages to send.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="delay">First message delay (hours)</Label>
              <Input
                id="delay"
                type="number"
                min={1}
                max={72}
                value={firstDelay}
                onChange={(e) => setFirstDelay(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="count">Number of messages in sequence</Label>
              <Input
                id="count"
                type="number"
                min={1}
                max={10}
                value={messageCount}
                onChange={(e) => setMessageCount(Number(e.target.value))}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Discount</CardTitle>
            <CardDescription>Optionally offer a discount in later messages.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="discount-toggle">Enable discount offer</Label>
              <Switch
                id="discount-toggle"
                checked={discountEnabled}
                onCheckedChange={setDiscountEnabled}
              />
            </div>
            {discountEnabled && (
              <div className="space-y-2">
                <Label htmlFor="discount-pct">Discount percentage</Label>
                <Input
                  id="discount-pct"
                  type="number"
                  min={1}
                  max={50}
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(Number(e.target.value))}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={createCampaign.isPending || !name}>
            {createCampaign.isPending ? "Creating..." : "Create campaign"}
          </Button>
          <Button variant="outline" type="button" asChild>
            <Link href="/dashboard/campaigns">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}

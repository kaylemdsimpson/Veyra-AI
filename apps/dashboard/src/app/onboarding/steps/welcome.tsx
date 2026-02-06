"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, DollarSign, Zap, Shield } from "lucide-react";

interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Recover your abandoned revenue</CardTitle>
        <CardDescription className="text-base">
          Veyra automatically recovers lost sales from abandoned checkouts.
          Connect your Shopify store and start recovering revenue in minutes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <Feature
            icon={<Zap className="h-5 w-5" />}
            title="Automatic recovery"
            description="Smart messages sent at the right time, to the right channel"
          />
          <Feature
            icon={<Shield className="h-5 w-5" />}
            title="Margin protection"
            description="Discounts are a last resort, not the default. Your margins stay healthy."
          />
          <Feature
            icon={<DollarSign className="h-5 w-5" />}
            title="Pay for results"
            description="You only pay when we recover revenue. No recovery, no charge."
          />
        </div>

        <Button onClick={onNext} className="w-full" size="lg">
          Connect your Shopify store
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

function Feature({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

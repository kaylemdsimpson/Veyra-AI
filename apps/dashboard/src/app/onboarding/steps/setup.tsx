"use client";

import { useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import type { OnboardingStatus } from "@veyra/types";

interface SetupStepProps {
  status: OnboardingStatus | undefined;
  onNext: () => void;
  refetch: () => void;
}

const setupSteps = [
  { key: "shopConnected" as const, label: "Shopify store connected" },
  { key: "webhooksRegistered" as const, label: "Webhook listeners registered" },
  { key: "scriptsInjected" as const, label: "Tracking scripts installed" },
  { key: "defaultCampaignCreated" as const, label: "Default recovery campaign created" },
  { key: "smartDiscountsEnabled" as const, label: "Smart discounts configured" },
];

export function SetupStep({ status, onNext, refetch }: SetupStepProps) {
  const completedCount = status
    ? setupSteps.filter((s) => status[s.key]).length
    : 0;
  const allComplete = completedCount === setupSteps.length;
  const progressPercent = (completedCount / setupSteps.length) * 100;

  // Poll for status updates
  useEffect(() => {
    if (allComplete) {
      const timeout = setTimeout(onNext, 1500);
      return () => clearTimeout(timeout);
    }

    const interval = setInterval(refetch, 2000);
    return () => clearInterval(interval);
  }, [allComplete, onNext, refetch]);

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle>Setting everything up</CardTitle>
        <CardDescription>
          We're configuring your store for automatic recovery.
          This only takes a moment.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Progress value={progressPercent} className="h-2" />

        <div className="space-y-3">
          {setupSteps.map((step) => {
            const done = status?.[step.key] ?? false;
            return (
              <div key={step.key} className="flex items-center gap-3">
                {done ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : completedCount > 0 && setupSteps[completedCount]?.key === step.key ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground/40" />
                )}
                <span className={done ? "text-foreground" : "text-muted-foreground"}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        {allComplete && (
          <p className="text-center text-sm font-medium text-emerald-600">
            All set! Redirecting...
          </p>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useOnboardingStatus } from "@/lib/queries";
import { WelcomeStep } from "./steps/welcome";
import { OAuthStep } from "./steps/oauth";
import { SetupStep } from "./steps/setup";
import { SuccessStep } from "./steps/success";

type Step = "welcome" | "oauth" | "setup" | "complete";

export default function OnboardingPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const { data: status, refetch } = useOnboardingStatus();
  const [currentStep, setCurrentStep] = useState<Step>("welcome");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    if (user.onboardingComplete) {
      router.replace("/dashboard");
      return;
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (status) {
      setCurrentStep(status.step);
    }
  }, [status]);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background to-muted/30 px-4">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Veyra</h1>
      </div>

      <div className="w-full max-w-lg">
        {currentStep === "welcome" && (
          <WelcomeStep onNext={() => setCurrentStep("oauth")} />
        )}
        {currentStep === "oauth" && (
          <OAuthStep
            onNext={() => {
              refetch();
              setCurrentStep("setup");
            }}
          />
        )}
        {currentStep === "setup" && (
          <SetupStep
            status={status}
            onNext={() => setCurrentStep("complete")}
            refetch={refetch}
          />
        )}
        {currentStep === "complete" && <SuccessStep />}
      </div>

      {/* Step indicator */}
      <div className="mt-8 flex gap-2">
        {(["welcome", "oauth", "setup", "complete"] as const).map((step, i) => (
          <div
            key={step}
            className={`h-2 w-8 rounded-full transition-colors ${
              i <= ["welcome", "oauth", "setup", "complete"].indexOf(currentStep)
                ? "bg-primary"
                : "bg-muted"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

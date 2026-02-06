"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, ArrowRight } from "lucide-react";

export function SuccessStep() {
  const router = useRouter();
  const { refreshUser } = useAuth();

  const handleContinue = async () => {
    await refreshUser();
    router.push("/dashboard");
  };

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        </div>
        <CardTitle className="text-2xl">Veyra is live</CardTitle>
        <CardDescription className="text-base">
          Your store is now protected. Here's what's active:
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg bg-muted/50 p-4 space-y-3">
          <ActiveItem>
            Abandoned checkouts are being monitored automatically
          </ActiveItem>
          <ActiveItem>
            Recovery emails will send at optimal times
          </ActiveItem>
          <ActiveItem>
            Smart discounts are enabled — only used when needed to protect your margins
          </ActiveItem>
          <ActiveItem>
            Attribution tracking is active — you'll see exactly what Veyra recovers
          </ActiveItem>
        </div>

        <Button onClick={handleContinue} className="w-full" size="lg">
          Go to dashboard
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

function ActiveItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      <p className="text-sm">{children}</p>
    </div>
  );
}

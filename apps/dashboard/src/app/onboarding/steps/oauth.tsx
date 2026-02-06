"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink, Store } from "lucide-react";

interface OAuthStepProps {
  onNext: () => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export function OAuthStep({ onNext }: OAuthStepProps) {
  const [shopDomain, setShopDomain] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = () => {
    const domain = shopDomain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");

    if (!domain.includes(".myshopify.com")) {
      setError("Please enter your full Shopify domain (e.g. your-store.myshopify.com)");
      return;
    }

    setError(null);
    setIsConnecting(true);

    // Redirect to backend OAuth flow
    window.location.href = `${API_URL}/auth/shopify?shop=${encodeURIComponent(domain)}`;
  };

  // Check if we're returning from OAuth
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth") === "success") {
      onNext();
      return null;
    }
    if (params.get("oauth") === "error") {
      return (
        <Card>
          <CardHeader className="text-center">
            <CardTitle>Connection failed</CardTitle>
            <CardDescription>
              Something went wrong connecting your Shopify store. Please try again.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => window.location.replace("/onboarding")} className="w-full">
              Try again
            </Button>
          </CardContent>
        </Card>
      );
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Store className="h-6 w-6 text-primary" />
        </div>
        <CardTitle>Connect your Shopify store</CardTitle>
        <CardDescription>
          Enter your Shopify store URL to get started.
          We'll ask for permission to manage your checkout recovery.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="shop">Store URL</Label>
          <Input
            id="shop"
            type="text"
            placeholder="your-store.myshopify.com"
            value={shopDomain}
            onChange={(e) => setShopDomain(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleConnect()}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          onClick={handleConnect}
          className="w-full"
          size="lg"
          disabled={isConnecting || !shopDomain.trim()}
        >
          {isConnecting ? "Connecting..." : "Connect to Shopify"}
          <ExternalLink className="ml-2 h-4 w-4" />
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          You'll be redirected to Shopify to approve the connection.
          We request read access to checkouts, orders, and customers.
        </p>
      </CardContent>
    </Card>
  );
}
